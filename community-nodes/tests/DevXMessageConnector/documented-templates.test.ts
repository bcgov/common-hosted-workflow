import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

import { executeNode, getSentContent, setupDevXConnectorEnv } from './helpers';

const PROJECT_ROOT = path.resolve(process.cwd(), '..');
const TEMPLATES_ROOT = path.join(PROJECT_ROOT, 'external-hooks/src/api/assets/templates');

type WorkflowNode = {
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, unknown>;
  credentials?: unknown;
};

type TemplateFixture = {
  id: number;
  workflow: {
    nodes: WorkflowNode[];
    connections: Record<string, unknown>;
    pinData?: unknown;
  };
};

type FormatterOutput = {
  json: Record<string, unknown>;
  pairedItem?: { item: number };
};

type Scenario = {
  id: number;
  slug: string;
  document: string;
  webhookPath: string;
  sampleBody: Record<string, unknown>;
  headers?: Record<string, string>;
  expectedText: string[];
};

const scenarios: Scenario[] = [
  {
    id: 4001,
    slug: 'deployment-status-adaptive-card',
    document: 'docs/ci-cd/cd/deployment-status-notifications.md',
    webhookPath: 'devx/deployment-status',
    sampleBody: {
      source: 'github-actions',
      repository: 'bcgov/common-hosted-workflow',
      workflow: 'Deploy Prod',
      run_id: '14388234892',
      event: 'release',
      environment: 'standard-prod',
      cluster: 'gold',
      namespace: 'c89a45-prod',
      image_tag: '3.1.2',
      status: 'success',
      deploy_outcome: 'success',
      helm: {
        status: 'deployed',
        last_deployed: '2026-11-05 09:30:12.123456 +0000 UTC',
        last_revision: { revision: 43, chart: 'main-1.4.0', app_version: '3.1.2' },
      },
      run_url: 'https://github.com/bcgov/common-hosted-workflow/actions/runs/14388234892',
      timestamp: '2026-11-05T19:21:10Z',
    },
    expectedText: ['Deploy succeeded', 'standard-prod', 'main-1.4.0'],
  },
  {
    id: 4002,
    slug: 'dns-routing-change-adaptive-card',
    document: 'docs/platform/dns-probe.md',
    webhookPath: 'devx/dns-routing-change',
    sampleBody: {
      event: 'dns_routing_change',
      domain: 'workflow.apps.gold.devops.gov.bc.ca',
      environment: 'production',
      previous_ip: '142.34.229.4',
      previous_routing: 'primary',
      current_ip: '142.34.64.4',
      current_routing: 'secondary',
      detected_at: '2026-11-06T15:04:22+00:00',
    },
    expectedText: ['Serving from GoldDR', 'primary', 'secondary'],
  },
  {
    id: 4003,
    slug: 'grafana-alert-adaptive-card',
    document: 'docs/operations/grafana-alert-notifications.md',
    webhookPath: 'devx/grafana-alert',
    sampleBody: {
      receiver: 'n8n-webhook',
      status: 'firing',
      alerts: [
        {
          status: 'firing',
          labels: {
            alertname: 'Bull Queue Failed Jobs',
            environment: 'c89a45-prod',
            severity: 'critical',
            team: 'platform',
          },
          annotations: {
            summary: "n8n's Bull queue has permanently failed jobs.",
            description: '3 job(s) have been in the failed set for 5+ minutes.',
          },
          startsAt: '2026-11-06T14:22:31.048102+00:00',
          endsAt: '0001-01-01T00:00:00Z',
          generatorURL: 'https://grafana.example/alerting/n8n-queue-jobs-failed/edit',
          silenceURL: 'https://grafana.example/alerting/silence/new',
          values: { A: 3, B: 1 },
        },
      ],
      groupLabels: { alertname: 'Bull Queue Failed Jobs' },
      externalURL: 'https://grafana.example/',
      version: '1',
      state: 'alerting',
    },
    expectedText: ['Firing — Critical', 'Bull Queue Failed Jobs', '3 job(s)'],
  },
  {
    id: 4004,
    slug: 'sysdig-alert-adaptive-card',
    document: 'docs/operations/sysdig-alert-notifications.md',
    webhookPath: 'devx/sysdig-alert-card',
    sampleBody: {
      alert: {
        id: 5,
        name: 'High CPU Usage Alert',
        description: 'Notify about critical cpu usage',
        severityLabel: 'High',
        threshold: 'Alert',
        thresholdLabel: 'Critical threshold',
        editUrl: 'https://app.sysdigcloud.com/#/alerts/5',
      },
      event: {
        id: 987654321,
        url: 'https://app.sysdigcloud.com/#/events/notifications/l:604800/987654321/details',
      },
      state: 'ACTIVE',
      timestamp: 1666792346000000,
      condition: 'avg(avg(sysdig_container_cpu_used_percent)) > 75.0',
      entities: [
        {
          entity:
            "kube_pod_name = 'backend-api' and kube_workload_name = 'my-application' and kube_namespace_name = 'enterprise' and kube_cluster_name = 'red-cluster'",
          metricValues: [{ metric: 'sysdig_container_cpu_used_percent', value: 89 }],
        },
      ],
      labels: { agent_id: '6543' },
    },
    expectedText: ['Triggered — High CPU Usage Alert', 'red-cluster', '89%'],
  },
  {
    id: 4005,
    slug: 'github-secret-scanning-alert-adaptive-card',
    document: 'docs/operations/github-secret-scanning-alert-notifications.md',
    webhookPath: 'devx/github-secret-scanning-alert',
    headers: {
      'x-github-event': 'secret_scanning_alert',
      'x-github-delivery': '00000000-0000-4000-8000-000000000042',
    },
    sampleBody: {
      action: 'created',
      alert: {
        number: 42,
        created_at: '2026-11-16T14:22:31Z',
        updated_at: '2026-11-16T14:22:31Z',
        state: 'open',
        resolution: null,
        secret_type_display_name: 'Example Token', // pragma: allowlist secret
        secret: 'SENSITIVE_TEST_MARKER', // pragma: allowlist secret
        metadata: { private: 'SENSITIVE_TEST_MARKER' },
      },
      resolution_comment: 'SENSITIVE_TEST_MARKER',
      repository: {
        full_name: 'bcgov/common-hosted-workflow',
        html_url: 'https://github.com/bcgov/common-hosted-workflow',
      },
    },
    expectedText: ['Secret detected', 'bcgov/common-hosted-workflow', 'alert #42'],
  },
];

function loadTemplate(slug: string): TemplateFixture {
  return JSON.parse(readFileSync(path.join(TEMPLATES_ROOT, slug, 'template.json'), 'utf8')) as TemplateFixture;
}

function documentedScript(relativePath: string): string {
  const markdown = readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8');
  const match = markdown.match(/## Code node script[\s\S]*?```javascript\n([\s\S]*?)\n```/);
  if (!match) throw new Error(`Code node script not found in ${relativePath}`);
  return match[1];
}

function runFormatter(jsCode: string, json: Record<string, unknown>): FormatterOutput[] {
  const formatter = runInNewContext(`(function($input) {\n${jsCode}\n})`) as (input: {
    all: () => Array<{ json: Record<string, unknown> }>;
  }) => FormatterOutput[];
  return formatter({ all: () => [{ json }] });
}

describe('documented Adaptive Card workflow templates', () => {
  setupDevXConnectorEnv();

  it.each(scenarios)('executes template $id with its documented payload', async (scenario) => {
    const fixture = loadTemplate(scenario.slug);
    const webhook = fixture.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
    const code = fixture.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code');
    const connector = fixture.workflow.nodes.find((node) => node.type === 'CUSTOM.devXMessageConnector');

    expect(fixture.id).toBe(scenario.id);
    expect(fixture.workflow.nodes.every((node) => node.credentials === undefined)).toBe(true);
    expect(fixture.workflow.pinData).toBeUndefined();
    expect(webhook?.parameters).toMatchObject({ httpMethod: 'POST', path: scenario.webhookPath });
    expect(connector?.parameters).toMatchObject({
      type: 'card',
      payload: '={{ $json.cardJson }}',
      mode: 'preview',
    });
    expect(code?.parameters.jsCode).toBe(documentedScript(scenario.document));

    const outputs = runFormatter(String(code?.parameters.jsCode), {
      headers: scenario.headers ?? {},
      params: {},
      query: {},
      body: scenario.sampleBody,
    });
    expect(outputs).toHaveLength(1);
    expect(outputs[0].json.cardJson).toEqual(expect.any(String));

    const serializedOutput = JSON.stringify(outputs);
    for (const text of scenario.expectedText) expect(serializedOutput).toContain(text);

    const { requestOptions } = await executeNode([
      {
        ...(connector?.parameters as { type: 'card'; payload: unknown; mode: 'preview' }),
        payload: outputs[0].json.cardJson,
      },
    ]);
    expect(requestOptions.url).toBe('https://devx.example/api/v1/messages/preview');
    expect(getSentContent(requestOptions)).toMatchObject({ kind: 'card' });

    if (scenario.id === 4005) {
      expect(serializedOutput).not.toContain('SENSITIVE_TEST_MARKER');
      expect(JSON.stringify(getSentContent(requestOptions))).not.toContain('SENSITIVE_TEST_MARKER');
    }
  });

  it('uses a unique path for every documented notification webhook', () => {
    const paths = scenarios.map((scenario) => scenario.webhookPath);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
