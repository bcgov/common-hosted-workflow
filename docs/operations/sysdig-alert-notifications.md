# Sysdig Alert Notifications

The [Sysdig CPU, memory, and PVC alerts](../technologies/sysdig.md#alert-scopes) send email and can also
POST to an n8n webhook. This guide follows the [Grafana](grafana-alert-notifications.md) and
[DNS Probe](../platform/dns-probe.md#n8n-workflow-setup) pattern: a Code node builds a Microsoft
Teams Adaptive Card and the DevX Message Connector delivers it.

```text
Sysdig Monitor → Webhook notification channel → n8n Webhook (POST)
  → Code (Sysdig payload to Adaptive Card) → DevX Message Connector → Teams
```

## n8n workflow setup

1. **Webhook** — set **HTTP Method** to **POST**, leave **Raw Body** off, and set **Authentication**
   to **Header Auth**. In the credential, set the header name to `Authorization` and the value to
   a dedicated shared secret (for example, `Bearer <shared-secret>`), not the Sysdig API token.
   With **Respond: Immediately**, a successful HTTP response means n8n accepted the request, not
   that Teams received it. Check the n8n execution for delivery results.
2. **Code** — set **Language** to **JavaScript** and **Mode** to **Run Once for All Items**. Paste
   the script below.
3. **DevX Message Connector** — configure the
   [Teams channel credential](../community-nodes/devx-message-connector/workflow-guide.md#configure-credentials),
   set **Type** to **Adaptive Card**, and set **Payload** to the expression `{{ $json.cardJson }}`.
   Start with **Mode: Preview**. Do not select **Template → Sysdig** for this workflow; that mode
   takes the original Sysdig body instead of the custom card.

## Payload reference

The Terraform channel uses [Sysdig's standard Webhook format](https://docs.sysdig.com/en/administration/configure-a-webhook-channel/),
with one `alert` object per delivery, not a Grafana-style `alerts[]` array. n8n shows the request
under `item.json.body` alongside `headers`, `params`, and `query`. The outer `[...]` in the editor
is n8n's list of output items; it is **not** part of the JSON to POST.

This shortened body is based on a Sysdig test notification. The formatter ignores `alert.body`
(the rendered email text), `event.username`, and custom fields, so they are omitted here.

```json
{
  "alert": {
    "id": 5,
    "name": "High CPU Usage Alert",
    "description": "Notify about critical cpu usage",
    "severityLabel": "High",
    "threshold": "Alert",
    "thresholdLabel": "Critical threshold",
    "editUrl": "https://app.sysdigcloud.com/#/alerts/5"
  },
  "event": {
    "id": 987654321,
    "url": "https://app.sysdigcloud.com/#/events/notifications/l:604800/987654321/details"
  },
  "state": "ACTIVE",
  "timestamp": 1666792346000000,
  "condition": "avg(avg(sysdig_container_cpu_used_percent)) > 75.0",
  "warningCondition": "avg(avg(sysdig_container_cpu_used_percent)) > 60.0",
  "entities": [
    {
      "entity": "kube_pod_name = 'backend-api' and kube_workload_name = 'my-application' and kube_namespace_name = 'enterprise' and kube_cluster_name = 'red-cluster'",
      "metricValues": [{ "metric": "sysdig_container_cpu_used_percent", "value": 89 }]
    }
  ],
  "labels": { "agent_id": "6543" }
}
```

- **Status:** `ACTIVE` renders as **Triggered** (amber for the `Warning` threshold); `OK` renders
  as **Resolved**. Other states are neutral. A resolved card is only generated if Sysdig sends
  an `OK` delivery.
- **Scope:** read cluster, namespace, workload, pod, and persistent volume claim from `labels`
  when present; otherwise look for quoted label assignments in `entities[].entity`, as in the
  sample. The PVC rules use `namespace` and `persistentvolumeclaim` for the claim's identity.
  Facts are omitted when unavailable.
- **Metric and time:** show values from `entities[].metricValues`. For `OK`, use `endEntities`
  values if supplied rather than showing the original triggering values as recovery values.
  Convert the top-level `timestamp` from epoch microseconds to UTC.
- **Links:** show **Open Sysdig event** and **Open alert rule** when `event.url` and `alert.editUrl`
  point to the configured HTTPS Sysdig origin. Use that origin in the script if your tenant's
  alert links use a different host.

## Code node script

The script accepts a body object, a JSON string under `body`, or a flat Sysdig object for
manual testing. It needs no imports. It returns only `card` (object) and `cardJson` (string)
per input item. Headers and the raw body are not passed downstream, but n8n can still retain
them in the Webhook node's execution data. Do not pin or share real requests containing credentials.

```javascript
// Format an authenticated Sysdig Monitor Webhook delivery for DevX Message Connector.
const SYSDIG_ORIGIN = 'https://app.sysdigcloud.com'; // Exact HTTPS origin, without a trailing slash.
const MAX_ROWS = 4; // Maximum segments per card and metric rows per segment.
const KUBE_LABELS = [
  ['Cluster', 'kube_cluster_name'],
  ['Namespace', 'kube_namespace_name', 'namespace'],
  ['Workload', 'kube_workload_name'],
  ['Pod', 'kube_pod_name'],
  ['PVC', 'persistentvolumeclaim'],
];

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const payloadOf = (json) => {
  let p = json?.body ?? json;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      throw new Error('Invalid JSON in Sysdig webhook.');
    }
  }
  if (!isObject(p) || !isObject(p.alert) || typeof p.alert.name !== 'string' || !p.alert.name.trim()) {
    throw new Error('Expected a Sysdig webhook object with alert.name.');
  }
  return p;
};

// Bound card text and escape Markdown rather than rendering arbitrary formatting.
const text = (value, limit = 160) => {
  if (Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  return (clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean).replace(/([\\`*_\[\]()<>~])/g, '\\$1');
};

const formatTime = (value) => {
  const micros = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(micros) || micros <= 0) return '';
  return new Date(Math.floor(micros / 1000)).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
};

const statusOf = (state, warning) => {
  if (state === 'OK') return { title: '✅ Resolved', style: 'good' };
  if (state === 'ACTIVE' && warning) return { title: '🟡 Triggered — Warning', style: 'warning' };
  if (state === 'ACTIVE') return { title: '🔴 Triggered', style: 'attention' };
  return { title: 'ℹ️ Sysdig notification', style: 'emphasis' };
};

// Standard Sysdig segments use `key = 'value' and ...`. Also accept comma-separated,
// double-quoted label assignments. This is a fallback for missing structured labels.
const segmentLabels = (entity) => {
  if (typeof entity !== 'string') return {};
  const pairs = entity.matchAll(
    /(?:^|[{,]|\s+and\s+)\s*(kube_(?:cluster|namespace|workload|pod)_name|namespace|persistentvolumeclaim)\s*=\s*(?:'([^']*)'|"([^"]*)")/g,
  );
  return Object.fromEntries(Array.from(pairs, ([, key, single, double]) => [key, single ?? double]));
};

const isSysdigLink = (url) => typeof url === 'string' && url.startsWith(`${SYSDIG_ORIGIN}/`) && !/[\s\\]/.test(url);

return $input.all().map((item, index) => {
  const p = payloadOf(item.json);
  const alert = p.alert;
  const state = typeof p.state === 'string' ? p.state.trim().toUpperCase() : '';
  const warning = typeof alert.threshold === 'string' && alert.threshold.trim().toUpperCase() === 'WARNING';
  const status = statusOf(state, warning);
  const recovered = asArray(p.endEntities);
  const showRecovery = state === 'OK' && recovered.length > 0;
  const entities = showRecovery ? recovered : asArray(p.entities);

  const facts = [
    { title: 'Severity', value: text(alert.severityLabel) },
    { title: 'Threshold', value: text(alert.thresholdLabel) || text(alert.threshold) },
    { title: 'Timestamp', value: formatTime(p.timestamp) },
  ].filter(({ value }) => value);
  const description = text(alert.description, 360);
  const condition = (warning ? text(p.warningCondition, 360) : '') || text(p.condition, 360);

  const sections = (entities.length ? entities.slice(0, MAX_ROWS) : [{}]).flatMap((entity) => {
    const labels = segmentLabels(entity?.entity);
    const rows = KUBE_LABELS.map(([title, ...keys]) => ({
      title,
      value:
        keys.map((key) => text(p.labels?.[key])).find(Boolean) || keys.map((key) => text(labels[key])).find(Boolean),
    })).filter(({ value }) => value);

    // On recovery without endEntities, keep the original segment labels but not the old values.
    const metrics = state !== 'OK' || showRecovery ? asArray(entity?.metricValues) : [];
    for (const metric of metrics.slice(0, MAX_ROWS)) {
      const value = text(metric?.value, 80);
      if (!value) continue;
      const name = text(metric.metric, 120);
      const percentMetric = typeof metric.metric === 'string' && metric.metric.endsWith('_percent');
      const unit = Number.isFinite(metric.value) && percentMetric ? '%' : '';
      rows.push({ title: 'Metric', value: `${name ? `${name}: ` : ''}${value}${unit}` });
    }
    if (metrics.length > MAX_ROWS) rows.push({ title: 'More metrics', value: `${metrics.length - MAX_ROWS} omitted` });
    return rows.length ? [{ type: 'FactSet', separator: true, facts: rows }] : [];
  });

  const actions = [
    { type: 'Action.OpenUrl', title: 'Open Sysdig event', url: p.event?.url },
    { type: 'Action.OpenUrl', title: 'Open alert rule', url: alert.editUrl },
  ].filter(({ url }) => isSysdigLink(url));

  const card = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    msteams: { width: 'Full' },
    body: [
      {
        type: 'Container',
        style: status.style,
        items: [
          {
            type: 'TextBlock',
            text: `${status.title} — ${text(alert.name)}`,
            weight: 'Bolder',
            size: 'Medium',
            wrap: true,
          },
        ],
      },
      ...(description ? [{ type: 'TextBlock', text: description, wrap: true }] : []),
      ...(facts.length ? [{ type: 'FactSet', facts }] : []),
      ...sections,
      ...(condition ? [{ type: 'TextBlock', text: `Condition: ${condition}`, size: 'Small', wrap: true }] : []),
      ...(entities.length > MAX_ROWS
        ? [{ type: 'TextBlock', text: `Showing the first ${MAX_ROWS} alert segments.`, isSubtle: true, wrap: true }]
        : []),
    ],
    ...(actions.length ? { actions } : {}),
  };

  return { json: { card, cardJson: JSON.stringify(card) }, pairedItem: { item: index } };
});
```

## Test and enable delivery

1. Select **Listen for test event** on the Webhook node and POST the sample body to its **Test URL**
   with `Content-Type: application/json` and the configured `Authorization` header. You can also use
   Sysdig's **Test notification** option on a test channel pointed at that URL while n8n is listening.
2. In **Preview**, verify **Triggered — High CPU Usage Alert**, severity **High**, cluster
   `red-cluster`, namespace `enterprise`, workload `my-application`, value **89%**, and timestamp
   **2022-10-26 13:52:26 UTC**. Sysdig's test sample uses `ACTIVE`, so it looks like a real alert;
   the sample event and alert links are illustrative.
3. Switch the connector to **Send** and publish the workflow. In the corresponding
   [GitHub environment](../technologies/sysdig.md#state-and-credentials) (`sysdig` for `b0c13b`,
   `standard-sysdig` for `c89a45`), set `ALERT_WEBHOOK_URL` to the **Production URL** and
   `ALERT_WEBHOOK_AUTHORIZATION` to the exact Header Auth value, including `Bearer ` if used.
   Do not include `Authorization:` in the value. Changing secrets does not run Terraform; use
   workflow dispatch to review the plan and then apply the channel change. Verify a real
   non-production PromQL alert as well as the sample, since the scope and metric fields depend
   on the rule that fired. For a volume alert, check that the card identifies the PVC and cluster.
