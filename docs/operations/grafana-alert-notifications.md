# Grafana Alert Notifications

Every `team=platform` Grafana alert (the **n8n System Log Alerts** and **n8n Health Alerts**
groups) fans out to the `n8n-webhook` contact point alongside the ops email. Grafana POSTs the
alert as JSON to a callback URL — an n8n workflow receives the callback, transforms the payload
into an MS Teams Adaptive Card using a Code node, and posts it to a Teams channel through the
[DevX Message Connector](../community-nodes/devx-message-connector/workflow-guide.md).

This mirrors the deployment-status pattern documented in
[Deployment Status Notifications](../ci-cd/cd/deployment-status-notifications.md). For the
alerting side (rules, routing, payload schema) see
[Observability Dashboards → Grafana Alerting](observability-dashboards.md#grafana-alerting).

## Flow

```
Grafana alert rules (folder "n8n")
  └─ Notification policy (team = platform)
       ├─ n8n-ops-email (email)
       └─ n8n-webhook contact point
            └─ POST payload JSON ──▶ n8n Webhook node
                 └─ Code node (payload ➜ Adaptive Card)   ◀── script documented below
                      └─ DevX Message Connector (Type: Adaptive Card)
                           └─ Teams channel card
```

## Webhook configuration (Grafana side)

The contact point is provisioned from
`helm/main/grafana-alerting/config/contact-points.yaml` — it POSTs a JSON body to the URL held
in the `GRAFANA_ALERT_WEBHOOK_URL` key of the `chwf-grafana` secret:

```sh
oc patch secret chwf-grafana -n <namespace> --type=merge \
  -p '{"stringData":{"GRAFANA_ALERT_WEBHOOK_URL":"https://<n8n-host>/webhook/<path>"}}'
```

| Behaviour         | Detail                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Scope             | `team=platform` alerts only (System Log + Health alerts); workflow-failure alerts are email-only                             |
| Method / body     | `POST` with `Content-Type: application/json`                                                                                 |
| Resolved messages | Sent too (`status: "resolved"`) — the card below renders them green                                                          |
| Authentication    | Optional `Authorization: Bearer` header via `GRAFANA_ALERT_WEBHOOK_SECRET` (see the commented settings in the contact point) |
| Grouping          | One POST per folder + alert name; repeat reminders every 4 hours while firing                                                |

## Payload reference

The webhook body is Grafana's standard webhook schema (`version: "1"`,
Alertmanager-compatible) — the same envelope for every rule. A firing example
(`Bull Queue Failed Jobs`):

```json
{
  "receiver": "n8n-webhook",
  "status": "firing",
  "orgId": 1,
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "Bull Queue Failed Jobs",
        "category": "infrastructure",
        "environment": "c89a45-prod",
        "grafana_folder": "n8n",
        "service": "n8n",
        "severity": "critical",
        "team": "platform"
      },
      "annotations": {
        "summary": "n8n's Bull queue has permanently failed jobs.",
        "description": "3 job(s) have been in the failed set for 5+ minutes. Failed jobs are not retried automatically — inspect them from the n8n Health dashboard."
      },
      "startsAt": "2026-11-06T14:22:31.048102+00:00",
      "endsAt": "0001-01-01T00:00:00Z",
      "generatorURL": "https://grafana-workflow.apps.gold.devops.gov.bc.ca/alerting/n8n-queue-jobs-failed/edit",
      "fingerprint": "6b3a1c9e02f4d877",
      "silenceURL": "https://grafana-workflow.apps.gold.devops.gov.bc.ca/alerting/silence/new?…",
      "values": { "A": 3, "B": 1 }
    }
  ],
  "groupLabels": { "alertname": "Bull Queue Failed Jobs", "grafana_folder": "n8n" },
  "commonLabels": { "…": "labels common to every alert in the group" },
  "commonAnnotations": { "…": "annotations common to every alert in the group" },
  "externalURL": "https://grafana-workflow.apps.gold.devops.gov.bc.ca/",
  "version": "1",
  "groupKey": "{grafana_folder=\"n8n\", alertname=\"Bull Queue Failed Jobs\"}:1762347751000",
  "truncatedAlerts": 0,
  "state": "alerting",
  "title": "[FIRING] Bull Queue Failed Jobs — n8n Platform",
  "message": "🔴 FIRING — Critical\n\nBull Queue Failed Jobs\n…"
}
```

| Field                          | Source                  | Notes                                                                                                                                     |
| ------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `receiver`                     | contact point           | Always `n8n-webhook`                                                                                                                      |
| `status` / `state`             | group lifecycle         | `firing`/`alerting` or `resolved`/`ok`                                                                                                    |
| `alerts[]`                     | alert instances         | One entry per instance in the group — iterate, don't assume exactly one                                                                   |
| `alerts[].labels`              | rule labels             | `alertname`, `severity`, `team`, `service`, `category`, `environment` (namespace injected at deploy time), `grafana_folder`               |
| `alerts[].annotations`         | rule annotations        | `summary`, `description` (already contains the breached value as text), `error_messages` (system-log rules list the matching error lines) |
| `alerts[].values`              | query evaluation        | refId → value: `A` is the breached metric, `B` the threshold result (`1` = condition true)                                                |
| `alerts[].startsAt` / `endsAt` | lifecycle timestamps    | RFC3339; `endsAt` is zero-time (`0001-01-01T00:00:00Z`) while firing                                                                      |
| `alerts[].generatorURL`        | Grafana deep link       | Opens the alert rule in the editor                                                                                                        |
| `alerts[].silenceURL`          | Grafana deep link       | Pre-filled silence form for this alert                                                                                                    |
| `alerts[].fingerprint`         | labels hash             | Stable key for de-duplicating notifications per instance                                                                                  |
| `groupLabels`                  | notification policy     | Policy groups by `grafana_folder` + `alertname`                                                                                           |
| `externalURL`                  | sending instance        | Base URL of the Grafana that sent the POST                                                                                                |
| `title` / `message`            | `n8n.alert.*` templates | Same rendered subject/body as the ops emails                                                                                              |
| `truncatedAlerts`              | payload                 | `0` — no `maxAlerts` limit is configured                                                                                                  |

### Scenarios

| Scenario                                                               | `status`   | `state`    | `values`                                           |
| ---------------------------------------------------------------------- | ---------- | ---------- | -------------------------------------------------- |
| Rule breached                                                          | `firing`   | `alerting` | `{ A: <metric>, B: 1 }`                            |
| Condition cleared                                                      | `resolved` | `ok`       | `{ A: <metric>, B: 0 }`                            |
| No-data firing (`n8n Metrics Unavailable` via `noDataState: Alerting`) | `firing`   | `alerting` | `{}` — no query value; `description` still renders |
| Several instances in one group                                         | `firing`   | `alerting` | `alerts[]` carries N entries                       |

## n8n workflow setup

1. **Webhook node** — method **POST**. Use the **Production** URL in the secret (the test URL
   is fine for manual tries from Grafana's contact-point _Send test notification_ button). Its
   output nests the payload under `body` (`{ headers, params, query, body }`).
2. **Code node** — mode **Run Once for All Items**, paste the script below.
3. **DevX Message Connector** — **Type: Adaptive Card**, **Payload: `{{ $json.cardJson }}`**,
   **Mode: Send**.

The script handles the payload whether it arrives flat, nested under `body`, or as a JSON
string, and adds `card` (object) and `cardJson` (string) to each item.

## Code node script

```javascript
// Turn the Grafana alert webhook payload into an MS Teams Adaptive Card
// for the DevX Message Connector ("Type: Adaptive Card").
// Adds to each item: card (object) and cardJson (string for the Payload field).

// Grafana sends RFC3339 timestamps ("2026-11-06T14:22:31.048102+00:00"); make them readable.
const formatTime = (value) => {
  if (!value) return 'unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
};

// `values` maps refIds to results — A is the Prometheus/Loki query result (the
// breached metric), B is the threshold expression (1 = condition true). Surface A.
const metricValueOf = (values) => {
  if (!values || typeof values !== 'object') return '';
  const raw = values.A !== undefined ? values.A : values[Object.keys(values)[0]];
  if (typeof raw === 'number') return Number(raw.toFixed(2)).toLocaleString('en-US');
  return raw === undefined || raw === null ? '' : String(raw);
};

const STATES = {
  critical: { emoji: '🔴', label: 'Firing — Critical', style: 'attention', color: 'Attention' },
  warning: { emoji: '🟡', label: 'Firing — Warning', style: 'warning', color: 'Warning' },
  unknown: { emoji: '❔', label: 'Firing', style: 'emphasis', color: 'Default' },
  resolved: { emoji: '✅', label: 'Resolved', style: 'good', color: 'Good' },
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
  const alerts = Array.isArray(p.alerts) ? p.alerts : [];

  const resolved = p.status === 'resolved' || p.state === 'ok';
  const severities = alerts.map((a) => String((a.labels || {}).severity || '').toLowerCase());
  const state = resolved
    ? STATES.resolved
    : severities.includes('critical')
      ? STATES.critical
      : severities.includes('warning')
        ? STATES.warning
        : STATES.unknown;

  // Header — the policy groups by folder + alert name, so the group carries one
  // alert name; fall back to the receiver name for anything else.
  const alertname =
    (p.groupLabels || {}).alertname || ((alerts[0] || {}).labels || {}).alertname || p.receiver || 'Grafana alert';
  const envs = [...new Set(alerts.map((a) => (a.labels || {}).environment).filter(Boolean))];
  const teams = [...new Set(alerts.map((a) => (a.labels || {}).team).filter(Boolean))];
  const subtitle = [
    envs.join(', ') || 'unknown environment',
    teams.join(', ') || 'grafana',
    alerts.length > 1 ? `${alerts.length} alerts` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // One section per alert instance — the rules' descriptions already carry the
  // breached value as text ("3 job(s) have been in the failed set…"). With a
  // single alert the header band already names it, so per-alert titles are only
  // added when several instances share the card.
  const showAlertTitles = alerts.length > 1;
  const sections = alerts.map((a) => {
    const labels = a.labels || {};
    const ann = a.annotations || {};
    const facts = [];
    if (labels.severity) facts.push({ title: 'Severity', value: String(labels.severity) });
    const value = metricValueOf(a.values);
    if (value !== '') facts.push({ title: 'Value', value });
    if (a.startsAt) facts.push({ title: 'Started', value: formatTime(a.startsAt) });
    if (a.status === 'resolved' && a.endsAt) facts.push({ title: 'Resolved', value: formatTime(a.endsAt) });
    return {
      type: 'Container',
      items: [
        ...(showAlertTitles
          ? [{ type: 'TextBlock', text: String(labels.alertname || 'Alert'), weight: 'Bolder', wrap: true }]
          : []),
        ...(ann.summary
          ? [{ type: 'TextBlock', text: String(ann.summary), isSubtle: true, size: 'Small', wrap: true }]
          : []),
        ...(ann.description ? [{ type: 'TextBlock', text: String(ann.description), wrap: true }] : []),
        ...(ann.error_messages
          ? [{ type: 'TextBlock', text: String(ann.error_messages), size: 'Small', wrap: true }]
          : []),
        ...(facts.length ? [{ type: 'FactSet', facts }] : []),
      ],
    };
  });

  // Fallback for payloads without alerts[] (e.g. an empty test notification).
  if (!sections.length) {
    sections.push({
      type: 'Container',
      items: [
        ...(p.title ? [{ type: 'TextBlock', text: String(p.title), weight: 'Bolder', wrap: true }] : []),
        ...(p.message ? [{ type: 'TextBlock', text: String(p.message), wrap: true }] : []),
        { type: 'TextBlock', text: 'No alert details in payload.', isSubtle: true, wrap: true },
      ],
    });
  }

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
            text: `${state.emoji} ${state.label} — ${alertname}`,
            weight: 'Bolder',
            size: 'Medium',
            wrap: true,
          },
          { type: 'TextBlock', text: subtitle, isSubtle: true, size: 'Small', wrap: true },
        ],
      },
      ...sections,
    ],
  };

  // Buttons: alert-rule deep link always; pre-filled silence while firing.
  const first = alerts[0] || {};
  const actions = [];
  if (first.generatorURL)
    actions.push({ type: 'Action.OpenUrl', title: 'Open alert rule', url: String(first.generatorURL) });
  if (!resolved && first.silenceURL)
    actions.push({ type: 'Action.OpenUrl', title: 'Silence in Grafana', url: String(first.silenceURL) });
  if (!actions.length && p.externalURL)
    actions.push({ type: 'Action.OpenUrl', title: 'Open Grafana', url: String(p.externalURL) });
  if (actions.length) card.actions = actions;

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

- **Status header band**: tinted by the worst state in the group — red (`attention`) when any
  firing alert is `critical`, amber (`warning`) for warning-only fires, grey (`emphasis`) for
  unknown firing severities, green (`good`) when resolved.
- **Header line**: `🔴 Firing — Critical — Bull Queue Failed Jobs`, with a subtle subtitle of
  environments · teams · alert count.
- **One section per alert instance**: subtle summary, the description (which already embeds
  the breached value, e.g. "3 job(s) have been in the failed set for 5+ minutes"), the
  `error_messages` lines for system-log alerts, and a FactSet with severity, metric value, and
  started/resolved timestamps. The bold alert-name title is repeated inside sections only when
  a card holds several alerts — with a single alert the header band already names it.
- **Buttons**: _Open alert rule_ (from `generatorURL`), _Silence in Grafana_ (pre-filled, only
  while firing), falling back to _Open Grafana_ when no deep links exist.

Use **Mode: Preview** on the DevX Message Connector to render a card without posting it while
testing — a quick way to see a real payload is Grafana's contact-point _Send test
notification_ button, which POSTs the same envelope with a sample alert.
