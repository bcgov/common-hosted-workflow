---
title: Deployment Status Notifications
sidebar_label: Status Notifications
sidebar_position: 5
---

# Deployment Status Notifications

Every deployment made through [`.github/workflows/_deploy.yml`](https://github.com/bcgov/common-hosted-workflow/blob/main/.github/workflows/_deploy.yml) sends a webhook callback with the result of the deployment. An n8n workflow receives the callback, transforms the payload into an MS Teams Adaptive Card using a Code node, and posts it to a Teams channel through the [DevX Message Connector](../community-nodes/devx-message-connector/workflow-guide.md).

## Flow

```
GitHub Actions (_deploy.yml)
  └─ "Send deployment status webhook" step (runs on success, failure, and cancellation)
       └─ POST payload JSON ──▶ n8n Webhook node
            └─ Code node (payload ➜ Adaptive Card)   ◀── script documented below
                 └─ DevX Message Connector (Type: Adaptive Card)
                      └─ Teams channel card
```

## Webhook configuration (GitHub side)

The URL is resolved inside `_deploy.yml` as:

```yaml
WEBHOOK_URL: ${{ secrets.DEPLOY_WEBHOOK_URL || secrets.REPO_DEPLOY_WEBHOOK_URL }}
```

| Secret                    | Scope                              | Purpose                                                                                                                                                                          |
| ------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_WEBHOOK_URL`      | Environment (e.g. `standard-prod`) | Optional per-environment override; wins if defined                                                                                                                               |
| `REPO_DEPLOY_WEBHOOK_URL` | Repository                         | Repository-wide default, threaded from the caller workflows (`deploy-dev.yml`, `deploy-test.yml`, `deploy-prod.yml` → `deploy-standard.yml` / `deploy-devx.yml` → `_deploy.yml`) |

If neither is set, the step logs `No deployment status webhook URL configured … skipping notification` and exits without failing the job.

> **Note:** secrets travel through the `secrets:` mappings of the workflow chain, not `with:` — the `secrets` context is not available inside `jobs.<job_id>.with`.

## Payload reference

The webhook body is a flat JSON object:

```json
{
  "source": "github-actions",
  "repository": "bcgov/common-hosted-workflow",
  "workflow": "Deploy Prod",
  "run_id": "14388234892",
  "event": "release",
  "environment": "standard-prod",
  "cluster": "gold",
  "namespace": "c89a45-prod",
  "image_tag": "3.1.2",
  "status": "success",
  "deploy_outcome": "success",
  "helm": {
    "status": "deployed",
    "description": "Upgrade complete",
    "last_deployed": "2026-11-05 09:30:12.123456 +0000 UTC",
    "last_revision": {
      "revision": 43,
      "updated": "2026-11-05 09:30:12.123456 +0000 UTC",
      "status": "deployed",
      "chart": "main-1.4.0",
      "app_version": "3.1.2",
      "description": "Upgrade complete"
    }
  },
  "run_url": "https://github.com/bcgov/common-hosted-workflow/actions/runs/14388234892",
  "timestamp": "2026-11-05T19:21:10Z"
}
```

| Field                     | Source                                           | Notes                                                            |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `workflow`                | `github.workflow` of the caller                  | `Deploy Dev`, `Deploy Test`, `Deploy Prod`, …                    |
| `run_id` / `run_url`      | GitHub run                                       | Stable dedup key + deep link                                     |
| `event`                   | `github.event_name`                              | `push`, `release`, `workflow_dispatch`                           |
| `environment` / `cluster` | deployment target                                | e.g. `standard-prod` on `gold` / `golddr`                        |
| `image_tag`               | deploy input                                     | Commit SHA or release version                                    |
| `status`                  | GitHub job status                                | `success`, `failure`, `cancelled`                                |
| `deploy_outcome`          | deploy step outcome                              | additionally `skipped` when the job failed before deploying      |
| `helm.*`                  | `helm status` / `helm history` of release `chwf` | Cluster-side view; `unknown` when the job failed before Helm ran |

### Failure scenarios

| Scenario                                    | `status`    | `deploy_outcome` | `helm.status`                |
| ------------------------------------------- | ----------- | ---------------- | ---------------------------- |
| Healthy deploy                              | `success`   | `success`        | `deployed`                   |
| Pods never became ready (rollout timed out) | `failure`   | `failure`        | `deployed`                   |
| `helm upgrade` failed                       | `failure`   | `failure`        | `failed` / `pending-upgrade` |
| Failed before deploying (auth, checkout)    | `failure`   | `skipped`        | last good state or `unknown` |
| Job cancelled                               | `cancelled` | `cancelled`      | last recorded state          |

## n8n workflow setup

1. **Webhook node** — listens for the POST. Its output nests the payload under `body` (`{ headers, params, query, body }`).
2. **Code node** — mode **Run Once for All Items**, paste the script below.
3. **DevX Message Connector** — **Type: Adaptive Card**, **Payload: `{{ $json.cardJson }}`**, **Mode: Send**.

The script handles the payload whether it arrives flat, nested under `body`, or as a JSON string, and adds `card` (object) and `cardJson` (string) to each item.

## Code node script

```javascript
// Turn the deployment status webhook payload into an MS Teams Adaptive Card
// for the DevX Message Connector ("Type: Adaptive Card").
// Adds to each item: card (object) and cardJson (string for the Payload field).

// Helm emits Go time format ("2026-11-05 09:30:12.123456 +0000 UTC"); make it readable.
const formatTime = (value) => {
  if (!value) return 'unknown';
  const raw = String(value);
  const go = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.\d+)? ([+-]\d{4}) UTC$/);
  if (go) return go[1] + ' ' + go[2] + ' UTC';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
};

const STATES = {
  success: { emoji: '✅', label: 'Deploy succeeded', style: 'good', color: 'Good' },
  failure: { emoji: '❌', label: 'Deploy failed', style: 'attention', color: 'Attention' },
  cancelled: { emoji: '🚫', label: 'Deploy cancelled', style: 'warning', color: 'Warning' },
};
const DEFAULT_STATE = { emoji: '❔', label: 'Unknown status', style: 'emphasis', color: 'Default' };

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
  const helm = p.helm || {};
  const rev = helm.last_revision || {};

  const state = STATES[p.status] || { ...DEFAULT_STATE, label: `Unknown status (${p.status ?? 'n/a'})` };

  let hint = '';
  if (p.status === 'failure') {
    if (p.deploy_outcome === 'skipped') {
      hint = 'Job failed before the deploy step — Helm status shows the last good release.';
    } else if (helm.status === 'deployed') {
      hint = 'Chart applied, but workloads are not healthy — check rollout/pods in the run logs.';
    } else if (['failed', 'pending-upgrade'].includes(helm.status)) {
      hint = 'The Helm upgrade did not complete on the cluster.';
    }
  }

  const facts = [];
  if (p.workflow || p.event) {
    facts.push({ title: 'Workflow', value: [p.workflow, p.event && `(${p.event})`].filter(Boolean).join(' ') });
  }
  if (p.status || p.deploy_outcome) {
    facts.push({
      title: 'Result',
      value: [p.status, p.deploy_outcome && `deploy step: ${p.deploy_outcome}`].filter(Boolean).join(' · '),
    });
  }
  if (p.image_tag) facts.push({ title: 'Image tag', value: String(p.image_tag) });
  if (p.namespace) facts.push({ title: 'Namespace', value: String(p.namespace) });
  facts.push({
    title: 'Helm release',
    value: [
      'chwf',
      helm.status || 'unknown',
      rev.revision !== undefined && `rev ${rev.revision}`,
      rev.chart,
      rev.app_version && `app v${rev.app_version}`,
    ]
      .filter(Boolean)
      .join(' · '),
  });
  if (helm.last_deployed) facts.push({ title: 'Last deployed', value: formatTime(helm.last_deployed) });
  if (p.timestamp) facts.push({ title: 'Payload time', value: formatTime(p.timestamp) });

  const headerItems = [
    {
      type: 'TextBlock',
      text: `${state.emoji} ${state.label} — ${p.environment ?? 'unknown env'}`,
      weight: 'Bolder',
      size: 'Medium',
      wrap: true,
    },
  ];
  const subtitle = [p.workflow, p.cluster && `cluster ${p.cluster}`].filter(Boolean).join(' · ');
  if (subtitle) {
    headerItems.push({ type: 'TextBlock', text: subtitle, isSubtle: true, size: 'Small', wrap: true });
  }

  const card = {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    msteams: { width: 'Full' },
    body: [
      { type: 'Container', style: state.style, items: headerItems },
      ...(facts.length ? [{ type: 'FactSet', facts }] : []),
      ...(hint ? [{ type: 'TextBlock', text: `⚠️ ${hint}`, color: state.color, wrap: true }] : []),
    ],
  };
  if (p.run_url) {
    card.actions = [{ type: 'Action.OpenUrl', title: 'View workflow run', url: String(p.run_url) }];
  }

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

- **Status header band**: tinted per state — green (`good`) for success, red (`attention`) for failure, amber (`warning`) for cancelled, grey (`emphasis`) for unknown.
- **FactSet**: workflow/trigger, result + deploy step, image tag, namespace, Helm release line (`chwf · deployed · rev 43 · main-1.4.0 · app v3.1.2`), and timestamps.
- **Hint line** on failures explaining the most likely cause (see the failure-scenario table above).
- **"View workflow run" button** when `run_url` is present.

Use **Mode: Preview** on the DevX Message Connector to render a card without posting it while testing.
