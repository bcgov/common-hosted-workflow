# GitHub Secret Scanning Alert Notifications

GitHub's `secret_scanning_alert` webhook reports changes to secret scanning alerts. An n8n
workflow receives the delivery, transforms its alert metadata into an MS Teams Adaptive Card
using a Code node, and posts it through the
[DevX Message Connector](../community-nodes/devx-message-connector/workflow-guide.md).

This follows the same pattern as [Grafana Alert Notifications](grafana-alert-notifications.md)
and [Deployment Status Notifications](../ci-cd/cd/deployment-status-notifications.md).
It consumes **GitHub's native secret scanning alerts**, not failures from the repository's
[`detect-secrets` pre-commit checks](../ci-cd/ci/secret-scanning.md).

> **Sensitive payload:** GitHub can include the literal credential in `alert.secret`.
> The script below deliberately excludes it, free-text comments, and provider metadata from
> both the card and its output item. This does **not** erase data already received by the
> Webhook node or saved in execution history; review the security precautions below before
> enabling real deliveries.

## Flow

```text
GitHub secret scanning alert
  └─ Webhook subscription: secret_scanning_alert
       └─ POST JSON ──▶ signature-validating receiver / ingress
            └─ n8n Webhook node (authenticated forwarding)
                 └─ Code node (safe metadata ➜ Adaptive Card)   ◀── script documented below
                      └─ DevX Message Connector (Type: Adaptive Card)
                           └─ Restricted Teams channel
```

## Webhook configuration (GitHub side)

1. Ensure GitHub secret scanning is enabled and available for the repositories being
   monitored. A webhook subscription does not enable scanning by itself.
2. Open the repository's **Settings → Webhooks → Add webhook**, or configure an organization
   webhook to monitor eligible repositories across the organization.
3. Set **Payload URL** to the signature-validating endpoint that forwards to the n8n
   workflow's **Production** webhook URL.
4. Set **Content type** to **application/json** and configure a strong **Secret**, stored
   securely by the receiver as well. Keep SSL verification enabled.
5. Select **Let me select individual events → Secret scanning alerts** and activate the
   webhook. This is `secret_scanning_alert`, not `secret_scanning_alert_location` or
   `secret_scanning_scan`.

For a GitHub App subscription, grant at least **read** access to the **Secret scanning
alerts** repository permission and subscribe to the same event. Repository, organization,
and GitHub App webhooks are supported.

Unlike the deployment callback, this webhook is configured in GitHub's webhook settings;
there is no GitHub Actions workflow step or `DEPLOY_WEBHOOK_URL` involved.

### Security and delivery precautions

- **Verify the signature before processing:** validate `X-Hub-Signature-256` using
  HMAC-SHA256, the webhook signing secret, and the **original request bytes**, with a
  constant-time comparison. Do not calculate the signature from `JSON.stringify()` of an
  already-parsed body. See GitHub's
  [signature validation guide](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).
- **The Code node below is a formatter, not a signature verifier.** Use a trusted receiver
  that authenticates forwarding to n8n. Alternatively, implement a separate verification
  step in n8n using the Webhook node's raw body support and a securely stored signing secret;
  reject invalid or missing signatures before formatting or sending a card. A matching
  `X-GitHub-Event` header, a hard-to-guess URL, or static Header Auth alone does not validate
  GitHub's signature.
- **Avoid persisting credentials:** disable saving successful, failed, and manual execution
  data and execution progress for this workflow, and check platform audit/error logging
  too. Do not pin or log real webhook payloads. If the secret must never enter n8n, remove
  `alert.secret`, comments, and sensitive metadata in the trusted receiver **after**
  signature verification, before forwarding.
- **Restrict access:** the workflow and Teams channel should be accessible only to the
  responsible repository/security operators. Even without the secret value, repository
  names and alert details may be sensitive.
- **Acknowledge promptly:** after signature validation, return a `2xx` response without
  waiting for Teams. Monitor downstream failures separately; an accepted webhook does not
  prove that the card was sent. If verification runs inside n8n, use **Respond to Webhook**
  after verification rather than acknowledging unauthenticated requests immediately.
- **Handle repeat deliveries:** `X-GitHub-Delivery` identifies a delivery. The script exposes
  it as `deliveryId` for an optional durable deduplication/retry step; it does not implement
  deduplication itself. `alertKey` correlates the alert across lifecycle changes and must
  **not** be used alone to suppress later `reopened` or `resolved` notifications.

## Payload reference

GitHub sends a single alert under `alert`, not a Grafana-style `alerts[]` array.
The HTTP headers identify the event and delivery:

```text
Content-Type: application/json
X-GitHub-Event: secret_scanning_alert
X-GitHub-Delivery: <delivery-uuid>
X-Hub-Signature-256: sha256=<signature-of-the-original-request-body>
```

A shortened, **redacted** `created` example follows — matching the shape both the current
octokit webhook schema and this repository's generated `types.ts` define for `created`.
Real repository/user objects contain additional fields, and optional alert fields vary with
GitHub version, secret type, and available features. The value shown for `secret` is a
placeholder, not a test credential.

```json
{
  "action": "created",
  "alert": {
    "number": 42,
    "created_at": "2026-11-16T14:22:31Z",
    "updated_at": "2026-11-16T14:22:31Z",
    "url": "https://api.github.com/repos/bcgov/common-hosted-workflow/secret-scanning/alerts/42",
    "html_url": "https://github.com/bcgov/common-hosted-workflow/security/secret-scanning/42",
    "locations_url": "https://api.github.com/repos/bcgov/common-hosted-workflow/secret-scanning/alerts/42/locations",
    "state": "open",
    "resolution": null,
    "resolved_at": null,
    "resolved_by": null,
    "secret_type": "github_personal_access_token",  # pragma: allowlist secret
    "secret_type_display_name": "GitHub Personal Access Token",  # pragma: allowlist secret
    "secret": "[REDACTED]",
    "push_protection_bypassed": false,
    "push_protection_bypassed_by": null,
    "push_protection_bypassed_at": null
  },
  "repository": {
    "id": 12345,
    "full_name": "bcgov/common-hosted-workflow",
    "html_url": "https://github.com/bcgov/common-hosted-workflow",
    "private": false
  },
  "organization": { "login": "bcgov" }
}
```

Fields beyond this shape appear on specific deliveries: `sender` on user-driven actions
(`resolved`, `reopened` — `created` is scanner-triggered and carries no sender), `assignee`
on assignment actions, and `validity` / `publicly_leaked` / `multi_repo` / `assigned_to` on
newer GitHub.com actions and in REST API responses (see the schema note below).

| Field                                                      | Purpose / handling                                                                                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `action`                                                   | What changed; see the action table below. It is separate from the alert's current state.                                                                                               |
| `alert.number`                                             | Repository-scoped alert number; together with `repository.full_name`, identifies the alert.                                                                                            |
| `alert.state`                                              | `open` or `resolved`.                                                                                                                                                                  |
| `alert.secret_type` / `secret_type_display_name`           | Secret classification and human-readable type; **not** the credential value.                                                                                                           |
| `alert.secret`                                             | Literal secret value when supplied — **never send to Teams**.                                                                                                                          |
| `alert.validity`                                           | `active`, `inactive`, or `unknown`, when supplied. `inactive` is not the same as `state: resolved`.                                                                                    |
| `alert.publicly_leaked` / `multi_repo`                     | Optional exposure indicators.                                                                                                                                                          |
| `alert.push_protection_bypassed*`                          | Optional bypass flag, actor, and timestamp; a bypass does not prove malicious intent.                                                                                                  |
| `alert.resolution` / `resolved_by` / `resolved_at`         | Closure reason, actor, and time. A resolved alert does not necessarily mean the credential was revoked.                                                                                |
| `alert.created_at` / `updated_at`                          | Alert timestamps; no separate deployment-style `timestamp` is required.                                                                                                                |
| `alert.html_url` / `locations_url`                         | GitHub alert page and locations API. The script builds its alert link from the repository and number; it does not fetch locations or source code.                                      |
| `alert.assigned_to` / top-level `assignee`                 | Current assignee when available; assignment/unassignment events can also identify the affected user under `assignee`.                                                                  |
| `alert.metadata`, `resolution_comment`, and other comments | Potentially sensitive free text; deliberately excluded.                                                                                                                                |
| `repository` / `sender`                                    | Repository context and delivery actor. `sender` is present on user-driven actions only and may be a bot or GitHub's `ghost` user; do not treat it as the person who leaked the secret. |
| `organization` / `enterprise` / `installation`             | Optional organization, enterprise, and GitHub App context; not required by the formatter.                                                                                              |

### Actions and card states

The current [GitHub webhook reference](https://docs.github.com/en/webhooks/webhook-events-and-payloads#secret_scanning_alert)
documents these nine actions:

| Action             | Meaning                                         | Card band                                                           |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| `created`          | A new secret scanning alert was created.        | 🔴 Red — Secret detected                                            |
| `publicly_leaked`  | The secret was detected in a public repository. | 🔴 Red — Secret publicly leaked                                     |
| `reopened`         | A previously closed alert was reopened.         | 🔴 Red — Secret alert reopened                                      |
| `resolved`         | The alert was closed.                           | ✅ Green — Secret alert resolved; includes the closure reason       |
| `validated`        | Secret validity was checked/updated.            | 🔴 Red when `active`; 🟡 amber when `inactive` or `unknown`         |
| `assigned`         | The alert was assigned to a user.               | ℹ️ Neutral — Secret alert assigned                                  |
| `unassigned`       | An assignee was removed.                        | 🟡 Amber — Secret alert unassigned                                  |
| `metadata_created` | Metadata was added to the alert.                | ℹ️ Neutral — Secret alert metadata added; metadata values omitted   |
| `metadata_removed` | Metadata was removed from the alert.            | ℹ️ Neutral — Secret alert metadata removed; metadata values omitted |

An alert whose `state` is already `resolved` uses the green closed-alert card regardless of
the action. Green means **GitHub marked the alert closed**, not that remediation has been
independently verified. Unknown future actions use a neutral update card unless the alert is
resolved. Missing optional fields are omitted or shown as `unknown`.

`secret_scanning_alert_location` is a separate event for additional locations of an existing
secret; this workflow intentionally does not handle it.

### Schema versions

Three references disagree slightly, and the formatter tolerates all of them:

| Reference                                                                                                                                                                                                                    | Actions                                                                                                                                  | Notes                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`types.ts` in this repo](https://github.com/bcgov/common-hosted-workflow/blob/main/community-nodes/nodes/DevXMessageConnector/sources/Github/types.ts) (DevX Message Connector, generated from octokit's GHES 3.5 examples) | `created`, `reopened`, `resolved`, **`revoked`**                                                                                         | Alert object lacks `validity`, `publicly_leaked`, `multi_repo`, `assigned_to`; `created` carries no `sender` |
| [octokit's current GitHub.com schemas](https://github.com/octokit/webhooks/tree/main/payload-schemas/api.github.com/secret_scanning_alert)                                                                                   | Same four                                                                                                                                | Same alert shape; `sender` is required on `resolved`, absent on `created`                                    |
| [docs.github.com webhook reference](https://docs.github.com/en/webhooks/webhook-events-and-payloads#secret_scanning_alert)                                                                                                   | Nine — adds `publicly_leaked`, `validated`, `assigned`, `unassigned`, `metadata_created`, `metadata_removed`; drops the `revoked` action | Newer actions carry the extra alert fields; `revoked` became a _resolution_ under `resolved`                 |

The formatter targets the current nine-action reference. For legacy `revoked` deliveries it
renders the green resolved-state card (their `alert.state` is `resolved` with
`resolution: "revoked"`), and for any unknown action it renders a neutral update card.
The REST API additionally allows `pattern_edited` and `pattern_deleted` as closure reasons;
both are handled.

## n8n workflow setup

The built-in template library includes this graph as **GitHub secret scanning alert to Teams Adaptive Card (Preview)** (template `4005`, in **Operational Teams notifications**). It uses the script below without modification, disables execution-data saving, and starts in Preview mode. The template still requires the trusted signature-validating receiver and other precautions above.

1. **Webhook node** — method **POST**, receiving authenticated forwarding from the
   signature-validating receiver. Use its **Production** URL for live traffic and a parsed
   JSON body for the formatter below. Preserve `X-GitHub-Event` and `X-GitHub-Delivery` when
   forwarding. **Respond: Immediately** is appropriate when the upstream receiver has
   already verified the signature.
2. **Code node** — mode **Run Once for All Items**, paste the script below.
3. **Optional delivery deduplication** — use `deliveryId` with durable storage if duplicate
   cards on redelivery are undesirable. Account for failed sends so they can be retried.
4. **DevX Message Connector** — **Type: Adaptive Card**, **Payload: `{{ $json.cardJson }}`**,
   **Mode: Send**. Do not pass the original `body` to the connector or use its GitHub template
   source for this event.

The script accepts the payload flat, under the Webhook node's `body`, or as a JSON string.
It ignores GitHub's setup `ping` and other event types when `X-GitHub-Event` is present.
Headerless inputs are accepted for already-verified payloads and manual fixtures; this is
**not** an authentication mechanism. Malformed alert payloads fail with a generic error
without echoing their contents.

Unlike the other notification scripts, it returns **only allowlisted metadata**, `card`, and
`cardJson`; it does not spread `item.json`, preserve binary data, or carry the original
credential-containing body into downstream nodes. It also preserves n8n item linking.

## Code node script

```javascript
// Format an already-authenticated GitHub secret_scanning_alert delivery.
// Never copy alert.secret, comments, provider metadata, or the original body.
// Signature verification must happen before this formatter.

// For GitHub Enterprise Server, replace this with your trusted HTTPS base URL.
const GITHUB_BASE_URL = 'https://github.com';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const payloadOf = (json) => {
  let p = isObject(json) && json.body !== undefined ? json.body : json;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      throw new Error('Invalid JSON for secret_scanning_alert.');
    }
  }
  if (!isObject(p)) throw new Error('Expected a secret_scanning_alert JSON object.');
  return p;
};

const headerOf = (json, name) => {
  const headers = isObject(json) && isObject(json.headers) ? json.headers : {};
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key && typeof headers[key] === 'string' ? headers[key] : '';
};

// Bound text length and escape Markdown; never stringify whole input objects.
const cardText = (value, fallback = 'unknown') => {
  const text =
    typeof value === 'string'
      ? value
          .trim()
          .replace(/[\r\n\t]+/g, ' ')
          .slice(0, 200)
      : '';
  return text ? text.replace(/\\/g, '\\\\').replace(/([`*_\[\]()<>])/g, '\\$1') : fallback;
};

const formatTime = (value) => {
  if (typeof value !== 'string' || !value) return 'unknown';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'unknown' : parsed.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
};

const STATES = {
  created: { emoji: '🔴', label: 'Secret detected', style: 'attention' },
  publicly_leaked: { emoji: '🔴', label: 'Secret publicly leaked', style: 'attention' },
  reopened: { emoji: '🔴', label: 'Secret alert reopened', style: 'attention' },
  resolved: { emoji: '✅', label: 'Secret alert resolved', style: 'good' },
  assigned: { emoji: 'ℹ️', label: 'Secret alert assigned', style: 'emphasis' },
  unassigned: { emoji: '🟡', label: 'Secret alert unassigned', style: 'warning' },
  metadata_created: { emoji: 'ℹ️', label: 'Secret alert metadata added', style: 'emphasis' },
  metadata_removed: { emoji: 'ℹ️', label: 'Secret alert metadata removed', style: 'emphasis' },
};

const RESOLUTIONS = {
  revoked: 'Revoked',
  false_positive: 'False positive',
  used_in_tests: 'Used in tests',
  wont_fix: "Won't fix",
  pattern_edited: 'Pattern edited',
  pattern_deleted: 'Pattern deleted',
};

const stateOf = (action, alertState, validity) => {
  if (action === 'resolved' || alertState === 'resolved') return STATES.resolved;
  if (action === 'validated') {
    return validity === 'active'
      ? { emoji: '🔴', label: 'Active secret confirmed', style: 'attention' }
      : {
          emoji: '🟡',
          label: validity === 'inactive' ? 'Secret reported inactive' : 'Secret validity updated',
          style: 'warning',
        };
  }
  return Object.hasOwn(STATES, action)
    ? STATES[action]
    : { emoji: '❔', label: 'Secret alert updated', style: 'emphasis' };
};

return $input.all().flatMap((item, index) => {
  const event = headerOf(item.json, 'x-github-event');
  if (event && event !== 'secret_scanning_alert') return []; // includes setup ping

  const p = payloadOf(item.json);
  const a = isObject(p.alert) ? p.alert : {};
  const repository = isObject(p.repository) ? p.repository : {};
  const repoName = repository.full_name;
  const action = p.action;
  if (
    !Number.isSafeInteger(a.number) ||
    a.number < 1 ||
    typeof repoName !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoName) ||
    typeof action !== 'string' ||
    !/^[a-z_]{1,64}$/.test(action)
  ) {
    throw new Error('Invalid secret_scanning_alert: expected action, alert number, and repository.');
  }

  const alertState = ['open', 'resolved'].includes(a.state) ? a.state : 'unknown';
  const validity = ['active', 'inactive', 'unknown'].includes(a.validity) ? a.validity : 'unknown';
  const resolution = typeof a.resolution === 'string' && Object.hasOwn(RESOLUTIONS, a.resolution) ? a.resolution : null;
  const state = stateOf(action, alertState, validity);
  const closed = action === 'resolved' || alertState === 'resolved';
  const secretType = cardText(a.secret_type_display_name || a.secret_type, 'Unknown secret type');
  const deliveryId = headerOf(item.json, 'x-github-delivery');

  const facts = [
    { title: 'Action', value: cardText(action) },
    { title: 'State', value: alertState },
    { title: 'Validity', value: validity },
  ];
  if (typeof a.publicly_leaked === 'boolean' || action === 'publicly_leaked') {
    facts.push({ title: 'Publicly leaked', value: a.publicly_leaked || action === 'publicly_leaked' ? 'Yes' : 'No' });
  }
  if (typeof a.multi_repo === 'boolean')
    facts.push({ title: 'Multiple repositories', value: a.multi_repo ? 'Yes' : 'No' });
  if (typeof a.push_protection_bypassed === 'boolean') {
    facts.push({ title: 'Push protection bypassed', value: a.push_protection_bypassed ? 'Yes' : 'No' });
  }
  if (a.push_protection_bypassed === true) {
    if (a.push_protection_bypassed_by?.login)
      facts.push({ title: 'Bypassed by', value: cardText(a.push_protection_bypassed_by.login) });
    if (a.push_protection_bypassed_at)
      facts.push({ title: 'Bypassed at', value: formatTime(a.push_protection_bypassed_at) });
  }
  const assignee = action === 'assigned' || action === 'unassigned' ? p.assignee : a.assigned_to;
  if (assignee?.login)
    facts.push({ title: action === 'unassigned' ? 'Assignee removed' : 'Assignee', value: cardText(assignee.login) });
  if (p.sender?.login) facts.push({ title: 'Triggered by', value: cardText(p.sender.login) });
  if (a.created_at) facts.push({ title: 'Created', value: formatTime(a.created_at) });
  if (a.updated_at) facts.push({ title: 'Updated', value: formatTime(a.updated_at) });
  if (closed) {
    facts.push({ title: 'Resolution', value: resolution ? RESOLUTIONS[resolution] : 'Not supplied' });
    if (a.resolved_by?.login) facts.push({ title: 'Resolved by', value: cardText(a.resolved_by.login) });
    if (a.resolved_at) facts.push({ title: 'Resolved', value: formatTime(a.resolved_at) });
  }

  const hint = closed
    ? 'GitHub marked this alert resolved. Check the closure reason; closing an alert does not prove the credential was revoked.'
    : action === 'validated' && validity === 'inactive'
      ? 'GitHub reports this credential inactive. The alert is not necessarily resolved; review it and record the appropriate closure reason.'
      : 'Review this alert in GitHub. Revoke or rotate exposed credentials and investigate their use; removing the committed value alone does not make a credential safe.';

  // Construct links on a trusted host, rather than forwarding arbitrary payload URLs.
  const repoUrl = `${GITHUB_BASE_URL}/${repoName}`;
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
            text: `${state.emoji} ${state.label} — ${secretType}`,
            weight: 'Bolder',
            size: 'Medium',
            wrap: true,
          },
          {
            type: 'TextBlock',
            text: `${cardText(repoName)} · alert #${a.number}`,
            isSubtle: true,
            size: 'Small',
            wrap: true,
          },
        ],
      },
      { type: 'FactSet', facts },
      { type: 'TextBlock', text: hint, wrap: true },
      {
        type: 'TextBlock',
        text: 'Secret value, comments, and sensitive metadata intentionally omitted.',
        isSubtle: true,
        size: 'Small',
        wrap: true,
      },
    ],
    actions: [
      { type: 'Action.OpenUrl', title: 'Open secret alert', url: `${repoUrl}/security/secret-scanning/${a.number}` },
      { type: 'Action.OpenUrl', title: 'Open repository', url: repoUrl },
    ],
  };

  return [
    {
      json: {
        event: 'secret_scanning_alert',
        action,
        deliveryId,
        alertKey: `${repoName}:${a.number}`,
        repository: repoName,
        alertNumber: a.number,
        state: alertState,
        validity,
        resolution,
        card,
        cardJson: JSON.stringify(card),
      },
      pairedItem: { item: index },
    },
  ];
});
```

## Card appearance

- **Status header band:** action-aware red/amber/neutral styling, or green for a resolved
  alert. The header names the secret **type**, never the detected credential.
- **Subtitle:** `bcgov/common-hosted-workflow · alert #42`, without a repeated section title.
- **FactSet:** action, current state, validity, available exposure/bypass/assignment details,
  and UTC timestamps. Resolved alerts also show the closure reason and actor.
- **Guidance:** review/rotation advice for open alerts, and an explicit reminder that closing
  an alert is not proof of revocation.
- **Buttons:** **Open secret alert** and **Open repository**, on the trusted GitHub host.

## Testing

Use the redacted example above with the Webhook node's **Test** URL while it is listening,
and set the DevX Message Connector to **Mode: Preview** before sending anything to Teams.
If the receiving endpoint validates signatures, sign the exact test request body with a
test-only signing secret; the placeholder signature above is not valid. Never bypass
production signature validation for testing.

Verify these cases:

- `created`, `reopened`, and `publicly_leaked`: red header.
- `resolved` with `state: resolved`, a closure reason, and timestamps: green header.
- `validated` with `validity: active`: red; `inactive` or `unknown`: amber.
- Assignment/metadata actions: the corresponding informational card, without metadata values.
- `X-GitHub-Event: ping` or another event: no output item and no Teams card.
- Missing optional fields and JSON-string bodies: still render correctly.
- Secret/comment/metadata fields containing an obvious fake marker: the marker must be absent
  from **both** `cardJson` and the complete Code node output.

GitHub sends a setup `ping` when creating a webhook; it is not a sample secret scanning alert.
For a live end-to-end check, use GitHub's **Recent deliveries** and **Redeliver** for an
existing alert delivery. Do not commit a real credential just to trigger a test.
