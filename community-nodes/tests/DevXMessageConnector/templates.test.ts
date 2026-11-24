import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { executeNode, getSentContent, setupDevXConnectorEnv } from './helpers';

/**
 * Executes the static DevX examples against the real connector transforms.
 * Webhook scenarios supply their sample request bodies explicitly because the
 * published graphs intentionally map {{ $json.body }} instead of pinning data.
 */
const TEMPLATES_ROOT = path.resolve(process.cwd(), '../external-hooks/src/api/assets/templates');

type ConnectorParameters = {
  type: 'template' | 'text' | 'html' | 'card';
  source?: string;
  payload: unknown;
  mode: 'preview';
  mentions?: { mention?: Array<{ email: string; name: string }> };
};

type WorkflowNode = {
  name: string;
  type: string;
  typeVersion: number;
  webhookId?: string;
  parameters: Record<string, unknown>;
};

type TemplateFixture = {
  id: number;
  workflow: {
    nodes: WorkflowNode[];
    connections: Record<string, unknown>;
  };
};

type Scenario = {
  id: number;
  slug: string;
  kind: string;
  template?: string;
  webhookPath?: string;
  samplePayload?: unknown;
};

const scenarios: Scenario[] = [
  { id: 2001, slug: 'devx-text-preview', kind: 'text' },
  { id: 2002, slug: 'devx-html-preview', kind: 'html' },
  { id: 2003, slug: 'devx-adaptive-card-preview', kind: 'card' },
  { id: 2004, slug: 'devx-template-generic-preview', kind: 'template', template: 'generic' },
  {
    id: 2005,
    slug: 'devx-template-rocket-chat-preview',
    kind: 'html',
    webhookPath: 'devx/rocket-chat',
    samplePayload: {
      text: 'Deployment completed',
      attachments: [
        {
          title: 'my-app',
          title_link: 'https://example.com/deployments/123',
          text: 'Version 1.2.3 is now live',
          color: '#36a64f',
          fields: [{ title: 'Environment', value: 'prod', short: true }],
        },
      ],
    },
  },
  {
    id: 2006,
    slug: 'devx-template-github-pull-request-preview',
    kind: 'template',
    template: 'github_pull_request',
    webhookPath: 'devx/github-pull-request',
    samplePayload: {
      action: 'opened',
      repository: { full_name: 'bcgov/common-hosted-workflow' },
      pull_request: {
        title: 'Add DevX connector examples',
        html_url: 'https://github.com/bcgov/common-hosted-workflow/pull/123',
        body: 'Adds previewable DevX Message Connector workflow templates.',
        user: { login: 'octocat' },
      },
    },
  },
  {
    id: 2007,
    slug: 'devx-template-github-workflow-run-preview',
    kind: 'template',
    template: 'github_workflow_run',
    webhookPath: 'devx/github-workflow-run',
    samplePayload: {
      action: 'completed',
      repository: { full_name: 'bcgov/common-hosted-workflow' },
      workflow_run: {
        conclusion: 'success',
        name: 'CI',
        head_branch: 'main',
        html_url: 'https://github.com/bcgov/common-hosted-workflow/actions/runs/123',
        head_sha: 'abcdef1234567890', // pragma: allowlist secret
        head_commit: { message: 'Run all checks' },
        triggering_actor: { login: 'ci-bot' },
      },
    },
  },
  {
    id: 2008,
    slug: 'devx-template-backup-container-preview',
    kind: 'template',
    template: 'db_backup',
    webhookPath: 'devx/backup-container',
    samplePayload: {
      projectFriendlyName: 'Common Hosted Workflow',
      projectName: 'common-hosted-workflow',
      statusCode: 'WARN',
      message: 'Backup finished with warnings',
    },
  },
  {
    id: 2009,
    slug: 'devx-template-sysdig-preview',
    kind: 'template',
    template: 'sysdig',
    webhookPath: 'devx/sysdig',
    samplePayload: {
      timestamp: 1620222000000000,
      alert: {
        severity: 2,
        editUrl: 'https://app-staging.sysdigcloud.com/#/alerts/21998727',
        subject: 'CPU usage is high on the example host',
        scope: 'example-namespace',
        name: 'CPU usage is high',
        description: 'CPU usage is above the configured threshold.',
      },
      state: 'ACTIVE',
    },
  },
  {
    id: 2010,
    slug: 'devx-template-statuscake-preview',
    kind: 'template',
    template: 'statuscake',
    webhookPath: 'devx/status-cake',
    samplePayload: {
      Status: 'UP',
      URL: 'https://example.com/health',
      StatusCode: 200,
      IP: '127.0.0.1',
      Tags: 'prod,web',
      Name: 'Example website health check',
      Checkrate: 300,
      TestID: 42,
      Method: 'GET',
    },
  },
  {
    id: 2011,
    slug: 'devx-template-uptime-com-preview',
    kind: 'template',
    template: 'uptime',
    webhookPath: 'devx/uptime-com',
    samplePayload: {
      data: {
        alert: {
          is_up: false,
          created_at: '2024-02-03T04:05:06.789Z',
        },
        service: { display_name: 'Workflow API' },
        links: { alert_details: 'https://uptime.com/alerts/123' },
      },
    },
  },
];

function loadTemplate(slug: string): TemplateFixture {
  return JSON.parse(readFileSync(path.join(TEMPLATES_ROOT, slug, 'template.json'), 'utf8')) as TemplateFixture;
}

function getConnector(fixture: TemplateFixture): WorkflowNode {
  const connector = fixture.workflow.nodes.find((node) => node.type === 'CUSTOM.devXMessageConnector');

  if (!connector) throw new Error(`${fixture.id}: CUSTOM.devXMessageConnector node not found`);
  expect(connector.typeVersion).toBe(0.1);
  return connector;
}

describe('DevXMessageConnector static workflow templates', () => {
  setupDevXConnectorEnv();

  it.each(scenarios)('executes template $id in preview mode', async (scenario) => {
    const fixture = loadTemplate(scenario.slug);
    const connector = getConnector(fixture);
    const parameters = connector.parameters as unknown as ConnectorParameters;
    const triggerName = scenario.webhookPath ? 'Webhook' : 'Manual Trigger';
    const trigger = fixture.workflow.nodes.find((node) => node.name === triggerName);

    expect(fixture.id).toBe(scenario.id);
    expect(trigger, `${scenario.slug}: ${triggerName} not found`).toBeDefined();
    expect(fixture.workflow.connections[triggerName]).toBeDefined();

    if (scenario.webhookPath) {
      expect(trigger).toMatchObject({ type: 'n8n-nodes-base.webhook', typeVersion: 2.1 });
      expect(trigger?.webhookId).toEqual(expect.any(String));
      expect(trigger?.parameters).toMatchObject({
        httpMethod: 'POST',
        path: scenario.webhookPath,
        responseMode: 'lastNode',
      });
      expect(parameters.payload).toBe('={{ $json.body }}');
    } else {
      expect(trigger).toMatchObject({ type: 'n8n-nodes-base.manualTrigger', typeVersion: 1 });
    }

    const { requestOptions } = await executeNode([
      { ...parameters, payload: scenario.samplePayload ?? parameters.payload },
    ]);

    expect(requestOptions.url).toBe('https://devx.example/api/v1/messages/preview');
    expect(getSentContent(requestOptions)).toMatchObject({ kind: scenario.kind });
    if (scenario.template) {
      expect(getSentContent(requestOptions)).toMatchObject({ template: scenario.template });
    }
  });

  it('uses a unique path for every source-specific webhook', () => {
    const paths = scenarios.flatMap((scenario) => (scenario.webhookPath ? [scenario.webhookPath] : []));

    expect(paths).toHaveLength(7);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
