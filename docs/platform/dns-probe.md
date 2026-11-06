---
title: DNS Probe
sidebar_label: DNS Probe
sidebar_position: 9
---

# DNS Probe

`dns-probe` is a small FastAPI service that watches the cluster's public DNS name and reports which cluster — Gold or GoldDR — the domain currently resolves to. It is deployed only on GoldDR (disaster recovery) namespaces, where its `/status` signal drives the conditional database restore and the failover CronJob (see [Gold/GoldDR Failover](./gold-dr-failover.md)).

When routing changes, the probe also notifies operators through two independent channels: an email and an optional webhook callback.

## Flow

```
DNS poll (every POLL_INTERVAL seconds)
  └─ socket.getaddrinfo(DOMAIN_NAME)
       └─ classify resolved IP against PRIMARY_IPS / SECONDARY_IPS
            └─ routing change detected (first resolution excluded)
                 ├─ Email  (SMTP, plain text)        ◀── ALERT_EMAIL_RECIPIENTS
                 └─ Webhook (POST JSON callback)     ◀── ALERT_WEBHOOK_URL (optional)
                      └─ n8n Webhook node
                           └─ Code node (payload ➜ Adaptive Card)   ◀── script documented below
                                └─ DevX Message Connector (Type: Adaptive Card)
                                     └─ Teams channel card
```

## How it monitors

- The watcher thread resolves `DOMAIN_NAME` every `POLL_INTERVAL` seconds (default 5) and classifies the first returned IP: `primary`, `secondary`, or `unknown` (anything not in the configured IP lists). A failed lookup is recorded as `error`, which classifies as `unknown`.
- Any change from the previous resolution fires the notification callback — including a DNS lookup failure (`primary → unknown`), so a domain that stops resolving also alerts.
- The service tracks the current IP, the current routing, and how long the routing has been stable (`duration_seconds`) in memory.
- Endpoints: `/status` returns `{ current_routing, resolved_ip, duration_seconds }` and is consumed by the conditional-restore and failover CronJobs; `/health` is used by the liveness/readiness probes.

## Notification channels

### Email

Sent directly from the probe via `smtplib` — independent of Grafana and of n8n.

- **Subject:** `[production] Domain routing change: primary -> secondary` (the `production` part is `APP_ENV`)
- **Body:** domain, environment, previous IP with routing, current IP with routing, and a one-line explanation
- **Recipients:** `ALERT_EMAIL_RECIPIENTS`, comma-separated; if unset, the email is skipped with a warning

### Webhook callback (optional)

Enabled only when `ALERT_WEBHOOK_URL` is defined. The probe POSTs the same facts as JSON:

```json
{
  "event": "dns_routing_change",
  "domain": "workflow.apps.gold.devops.gov.bc.ca",
  "environment": "production",
  "previous_ip": "142.34.229.4",
  "previous_routing": "primary",
  "current_ip": "142.34.64.4",
  "current_routing": "secondary",
  "detected_at": "2026-11-06T15:04:22+00:00"
}
```

| Behaviour          | Detail                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| Method / body      | `POST` with `Content-Type: application/json`                                   |
| Enabled when       | `ALERT_WEBHOOK_URL` is set in the `chwf-dns-probe` secret                       |
| Timeout            | 10 seconds                                                                     |
| Failure handling   | Logged and swallowed — a webhook outage never blocks the email (and vice versa) |
| Resolved / clear   | Not sent — every notification describes a change; the next one may be the change back |

This payload is a single flat object — unlike [Grafana's webhook schema](../operations/grafana-alert-notifications.md#payload-reference), there is no `alerts[]` envelope to iterate. The n8n workflow that turns this callback into a Teams card is documented below.

## n8n workflow setup

1. **Webhook node** — method **POST**. Use the **Production** URL in the secret (the test URL
   is handy for manual tries — the probe only fires on a real routing change).
2. **Code node** — mode **Run Once for All Items**, paste the script below.
3. **DevX Message Connector** — **Type: Adaptive Card**, **Payload: `{{ $json.cardJson }}`**,
   **Mode: Send**.

The script handles the payload whether it arrives flat, nested under `body`, or as a JSON
string, and adds `card` (object) and `cardJson` (string) to each item.

## Code node script

```javascript
// Turn the dns-probe routing-change webhook payload into an MS Teams Adaptive Card
// for the DevX Message Connector ("Type: Adaptive Card").
// Adds to each item: card (object) and cardJson (string for the Payload field).

const formatTime = (value) => {
  if (!value) return 'unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
};

// Every dns-probe notification describes a change — the direction it points in
// decides the band colour: losing routing is red, serving from DR is amber,
// serving from Gold (including failback) is green. An unknown -> unknown pair
// carries no transition at all (e.g. an empty test payload) and stays neutral.
const stateOf = (from, to) => {
  if (to === 'unknown' && from !== 'unknown') return { emoji: '🔴', label: 'DNS routing lost', style: 'attention' };
  if (to === 'secondary') return { emoji: '🟡', label: 'Serving from GoldDR', style: 'warning' };
  if (to === 'primary') return { emoji: '🟢', label: 'Serving from Gold', style: 'good' };
  return { emoji: '❔', label: 'Routing changed', style: 'emphasis' };
};

// n8n's Webhook node wraps the request as { headers, params, query, body } —
// dig the actual payload out of `body` (object or JSON string) when present.
const payloadOf = (json) => {
  let p = json || {};
  if (p.body !== undefined) {
    if (typeof p.body === 'string') {
      try {
        p = JSON.parse(p.body);
      } catch {
        p = {};
      }
    } else {
      p = p.body;
    }
  }
  return p && typeof p === 'object' ? p : {};
};

return $input.all().map((item) => {
  const p = payloadOf(item.json);
  const from = p.previous_routing || 'unknown';
  const to = p.current_routing || 'unknown';
  const state = stateOf(from, to);
  const domain = p.domain || 'unknown domain';

  const card = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    msteams: { width: 'Full' },
    body: [
      {
        type: 'Container',
        style: state.style,
        items: [
          {
            type: 'TextBlock',
            text: `${state.emoji} ${state.label}`,
            weight: 'Bolder',
            size: 'Medium',
            wrap: true,
          },
          {
            type: 'TextBlock',
            text: `${domain} · ${p.environment || 'unknown environment'}`,
            isSubtle: true,
            size: 'Small',
            wrap: true,
          },
        ],
      },
      {
        type: 'TextBlock',
        text: `Routing changed from **${from}** (${p.previous_ip || 'no IP'}) to **${to}** (${p.current_ip || 'no IP'}).`,
        wrap: true,
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Domain', value: domain },
          { title: 'Environment', value: p.environment || 'unknown' },
          { title: 'Detected', value: formatTime(p.detected_at) },
        ],
      },
    ],
  };

  return {
    json: {
      ...item.json, // preserve webhook fields (headers/body/...)
      card,
      cardJson: JSON.stringify(card),
    },
  };
});
```

## Card appearance

- **Status header band**: tinted by the *direction* of the change — red (`attention`) when the
  domain stops resolving or lands on an unclassified IP ("DNS routing lost"), amber
  (`warning`) when traffic moves to GoldDR, green (`good`) when it is on — or back to — Gold.
- **Header line**: the state label, with a subtle `domain · environment` subtitle.
- **Body**: one sentence mirroring the email — previous routing (IP) → current routing (IP).
- **FactSet**: Domain, Environment, Detected (UTC).
- **Buttons**: none — the payload carries no deep links. For a quick test render, POST the
  sample payload above to the webhook node's **Test** URL with curl and use **Mode: Preview**
  on the DevX Message Connector.

## Configuration

Non-secret settings are set in the Helm values (the `dns-probe.env` block of each `values-<namespace>-golddr.yaml` overlay); environment-specific identity and routing values are supplied through the `chwf-dns-probe` secret and injected with `envFrom`.

| Variable                | Where      | Purpose                                                            |
| ----------------------- | ---------- | ------------------------------------------------------------------ |
| `DOMAIN_NAME`           | secret     | The domain to watch (**required** — the container exits without it) |
| `PRIMARY_IPS`           | secret     | Comma-separated Gold cluster IPs → `primary`                        |
| `SECONDARY_IPS`         | secret     | Comma-separated GoldDR cluster IPs → `secondary`                    |
| `ALERT_EMAIL_RECIPIENTS`| secret     | Comma-separated alert email recipients                              |
| `ALERT_WEBHOOK_URL`     | secret     | Optional webhook callback URL; empty/absent disables the channel    |
| `APP_ENV`               | values     | Label used in the email subject and webhook payload                 |
| `SMTP_HOST` / `SMTP_PORT` | values   | Mail relay (default `apps.smtp.gov.bc.ca:25`)                       |
| `SMTP_SENDER`           | values     | From address (default `DoNotReplyCITZ@gov.bc.ca`)                   |
| `POLL_INTERVAL`         | values     | Seconds between DNS lookups (default 5)                             |
| `ALERT_ON_STARTUP`      | values     | `true` also notifies on the first resolution after a pod restart (default `false`) |

To add or change a secret-supplied value:

```sh
oc patch secret chwf-dns-probe -n <golddr-namespace> --type=merge \
  -p '{"stringData":{"ALERT_WEBHOOK_URL":"https://<n8n-host>/webhook/<path>"}}'
```

Then restart the deployment to pick up the new value.

## Deployment

| Aspect     | Detail                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| Chart      | `helm/_dns-probe`, conditionally enabled via `dns-probe.enabled: true`     |
| Enabled on | GoldDR overlays only (`values-*-golddr.yaml`)                              |
| Image      | `ghcr.io/bcgov/chwf-dns-probe`, built from [`dns-probe/`](https://github.com/bcgov/common-hosted-workflow/tree/main/dns-probe) in this repository |
| Service    | ClusterIP on port 8000 — `http://chwf-dns-probe:8000/status` (in-cluster only) |

## Local development

```sh
cd dns-probe
cp sample.env .env.local       # point DOMAIN_NAME at a domain you control
python -m pip install -r requirements.txt
python src/main.py             # serves /health and /status on :8000
python -m pytest               # unit tests (classification, state, notifications)
```
