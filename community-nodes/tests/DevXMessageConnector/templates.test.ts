import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { executeNode, getSentContent, setupDevXConnectorEnv } from './helpers';

/**
 * Executes the static DevX examples against the real connector transforms.
 * This keeps the public template payloads aligned with the node's supported
 * scenarios instead of only checking that their JSON parses.
 */
const TEMPLATES_ROOT = path.resolve(process.cwd(), '../external-hooks/src/api/assets/templates');

type ConnectorParameters = {
  type: 'template' | 'text' | 'html' | 'card';
  source?: string;
  payload: unknown;
  mode: 'preview';
  mentions?: { mention?: Array<{ email: string; name: string }> };
};

type TemplateFixture = {
  id: number;
  workflow: {
    nodes: Array<{
      type: string;
      typeVersion: number;
      parameters: ConnectorParameters;
    }>;
  };
};

const scenarios = [
  { id: 2001, slug: 'devx-text-preview', kind: 'text' },
  { id: 2002, slug: 'devx-html-preview', kind: 'html' },
  { id: 2003, slug: 'devx-adaptive-card-preview', kind: 'card' },
  { id: 2004, slug: 'devx-template-generic-preview', kind: 'template', template: 'generic' },
  { id: 2005, slug: 'devx-template-rocket-chat-preview', kind: 'html' },
  { id: 2006, slug: 'devx-template-github-pull-request-preview', kind: 'template', template: 'github_pull_request' },
  { id: 2007, slug: 'devx-template-github-workflow-run-preview', kind: 'template', template: 'github_workflow_run' },
  { id: 2008, slug: 'devx-template-backup-container-preview', kind: 'template', template: 'db_backup' },
  { id: 2009, slug: 'devx-template-sysdig-preview', kind: 'template', template: 'sysdig' },
  { id: 2010, slug: 'devx-template-statuscake-preview', kind: 'template', template: 'statuscake' },
  { id: 2011, slug: 'devx-template-uptime-com-preview', kind: 'template', template: 'uptime' },
] as const;

function loadConnectorParameters(slug: string): ConnectorParameters {
  const fixture = JSON.parse(readFileSync(path.join(TEMPLATES_ROOT, slug, 'template.json'), 'utf8')) as TemplateFixture;
  const connector = fixture.workflow.nodes.find((node) => node.type === 'CUSTOM.devXMessageConnector');

  if (!connector) throw new Error(`${slug}: CUSTOM.devXMessageConnector node not found`);
  expect(connector.typeVersion).toBe(0.1);
  return connector.parameters;
}

describe('DevXMessageConnector static workflow templates', () => {
  setupDevXConnectorEnv();

  it.each(scenarios)('executes template $id in preview mode', async ({ slug, kind, template }) => {
    const parameters = loadConnectorParameters(slug);
    const { requestOptions } = await executeNode([parameters]);

    expect(requestOptions.url).toBe('https://devx.example/api/v1/messages/preview');
    expect(getSentContent(requestOptions)).toMatchObject({ kind });
    if (template) {
      expect(getSentContent(requestOptions)).toMatchObject({ template });
    }
  });
});
