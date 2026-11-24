import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { absolutizeImageUrls, loadTemplateLibrary } from '../../../src/api/services/templates/library';

const ASSETS_DIR = path.join(process.cwd(), 'src/api/assets/templates');

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'chwf-templates-'));
  tempDirs.push(dir);
  return dir;
}

function writeTemplate(dir: string, slug: string, template: unknown): void {
  mkdirSync(path.join(dir, slug), { recursive: true });
  writeFileSync(
    path.join(dir, slug, 'template.json'),
    typeof template === 'string' ? template : JSON.stringify(template),
  );
}

function makeTemplate(id: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    description: `${name} description`,
    createdAt: '2026-01-01T00:00:00.000Z',
    user: { username: 'tester' },
    categories: [{ id: 1, name: 'Starter' }],
    workflow: {
      nodes: [{ name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', position: [0, 0] }],
      connections: {},
    },
    ...extra,
  };
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('loadTemplateLibrary', () => {
  it('loads the templates that ship in the repo', () => {
    const library = loadTemplateLibrary(ASSETS_DIR);

    expect(library.templates.length).toBeGreaterThanOrEqual(4);
    expect(library.templates.map((template) => template.id)).toEqual(expect.arrayContaining([1001, 1002, 1003, 1004]));
    expect(library.templatesById.get(1001)?.name).toContain('Postgres');

    expect(library.collections.length).toBeGreaterThanOrEqual(1);
    expect(library.collectionsById.get(1)?.workflowIds).toEqual([1002, 1001, 1003]);
    expect(library.collectionsById.get(1)?.nodes.length).toBeGreaterThan(0);

    expect(library.categories.map((category) => category.name)).toEqual(
      expect.arrayContaining(['Starter', 'Communication', 'Data & Storage', 'Development', 'Monitoring']),
    );
  });

  it('uses the same description sections for every shipped template', () => {
    const library = loadTemplateLibrary(ASSETS_DIR);

    for (const template of library.templates) {
      const headings = [...template.description.matchAll(/^## .+$/gm)].map((match) => match[0]);
      expect(headings, `template ${template.id}`).toEqual(['## What it does', '## Setup', '## Notes']);

      const bodies = template.description.split(/^## (?:What it does|Setup|Notes)\n\n/m).slice(1);
      expect(bodies, `template ${template.id} section bodies`).toHaveLength(3);
      for (const body of bodies) expect(body.trim().length, `template ${template.id}`).toBeGreaterThan(0);
    }
  });

  it('keeps the shipped node parameters compatible with their advertised behavior', () => {
    const library = loadTemplateLibrary(ASSETS_DIR);

    const httpNode = library.templatesById
      .get(1004)
      ?.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.httpRequest');
    expect(httpNode?.parameters).toMatchObject({
      options: { response: { response: { fullResponse: true, neverError: true } } },
    });

    const sheetsNode = library.templatesById
      .get(1001)
      ?.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.googleSheets');
    expect(sheetsNode?.parameters).toMatchObject({
      documentId: { __rl: true, mode: 'id', value: 'YOUR_SPREADSHEET_ID' },
      sheetName: { __rl: true, mode: 'name', value: 'Orders' },
    });

    const postgres = library.templatesById.get(1001);
    expect(postgres?.workflow.nodes.at(-1)).toMatchObject({
      name: 'Mark orders as exported',
      type: 'n8n-nodes-base.postgres',
    });
    expect(postgres?.workflow.connections['Append to sheet']).toBeDefined();
  });

  it('loads every DevX Message Connector scenario into its dedicated collection', () => {
    const library = loadTemplateLibrary(ASSETS_DIR);
    const scenarios = [
      [2001, 'text', undefined, undefined],
      [2002, 'html', undefined, undefined],
      [2003, 'card', undefined, undefined],
      [2004, 'template', 'generic', undefined],
      [2005, 'template', 'rocket-chat', 'devx/rocket-chat'],
      [2006, 'template', 'github', 'devx/github-pull-request'],
      [2007, 'template', 'github', 'devx/github-workflow-run'],
      [2008, 'template', 'backup-container', 'devx/backup-container'],
      [2009, 'template', 'sysdig', 'devx/sysdig'],
      [2010, 'template', 'status-cake', 'devx/status-cake'],
      [2011, 'template', 'uptime-com', 'devx/uptime-com'],
    ] as const;

    for (const [id, type, source, webhookPath] of scenarios) {
      const template = library.templatesById.get(id);
      const connector = template?.workflow.nodes.find((node) => node.type === 'CUSTOM.devXMessageConnector');
      const triggerName = webhookPath ? 'Webhook' : 'Manual Trigger';
      const trigger = template?.workflow.nodes.find((node) => node.name === triggerName);

      expect(connector, `template ${id}`).toBeDefined();
      expect(connector?.typeVersion).toBe(0.1);
      expect(connector?.parameters).toMatchObject({ type, mode: 'preview' });
      expect(connector?.parameters.source).toBe(source);
      expect(connector?.credentials).toBeUndefined();
      expect(trigger, `template ${id} trigger`).toBeDefined();
      expect(template?.workflow.connections[triggerName]).toBeDefined();

      if (webhookPath) {
        expect(trigger).toMatchObject({ type: 'n8n-nodes-base.webhook', typeVersion: 2.1 });
        expect(trigger?.parameters).toMatchObject({
          httpMethod: 'POST',
          path: webhookPath,
          responseMode: 'lastNode',
        });
        expect(connector?.parameters.payload).toBe('={{ $json.body }}');
      } else {
        expect(trigger).toMatchObject({ type: 'n8n-nodes-base.manualTrigger', typeVersion: 1 });
      }

      expect((template?.workflow as Record<string, unknown> | undefined)?.pinData).toBeUndefined();
    }

    expect(library.collectionsById.get(2)?.workflowIds).toEqual(scenarios.map(([id]) => id));
    expect(library.collectionsById.get(2)?.nodes.length).toBeGreaterThan(0);
  });

  it('ships the documented CHEFS review and resubmission workflow without credentials', () => {
    const library = loadTemplateLibrary(ASSETS_DIR);
    const template = library.templatesById.get(3001);

    expect(template).toBeDefined();
    expect(template?.categories).toEqual(
      expect.arrayContaining([
        { id: 7, name: 'CHEFS' },
        { id: 8, name: 'Human in the Loop' },
      ]),
    );
    expect(template?.workflow.nodes).toHaveLength(11);
    expect(template?.workflow.nodes.every((node) => node.credentials === undefined)).toBe(true);
    expect((template?.workflow as Record<string, unknown> | undefined)?.pinData).toBeUndefined();

    const webhook = template?.workflow.nodes.find((node) => node.name === 'CHEFS Event');
    expect(webhook).toMatchObject({
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2.1,
      parameters: { httpMethod: 'POST', path: 'trip-plan', authentication: 'headerAuth' },
    });

    const reviewer = template?.workflow.nodes.find((node) => node.name === 'Reviewer Decision');
    expect(reviewer).toMatchObject({
      type: 'CUSTOM.workflowInteractionLayer',
      parameters: { resource: 'action', operation: 'createAndWait', actionType: 'getapproval' },
    });

    const resubmitWait = template?.workflow.nodes.find((node) => node.name === 'CHEFS Resubmit Wait');
    expect(resubmitWait).toMatchObject({
      type: 'CUSTOM.chefsResubmitWait',
      typeVersion: 1.1,
      parameters: { incomingAuthentication: 'headerAuth' },
    });
    expect(template?.workflow.connections['Re-extract Submission']).toEqual({
      main: [[{ node: 'Build Review Context', type: 'main', index: 0 }]],
    });

    expect(library.collectionsById.get(3)?.workflowIds).toEqual([3001, 3002]);
    expect(library.collectionsById.get(3)?.nodes.length).toBeGreaterThan(0);
  });

  it('ships the documented multi-actor approval graph with explicit callback settings', () => {
    const library = loadTemplateLibrary(ASSETS_DIR);
    const template = library.templatesById.get(3002);

    expect(template).toBeDefined();
    expect(template?.workflow.nodes).toHaveLength(6);
    expect(template?.workflow.nodes.every((node) => node.credentials === undefined)).toBe(true);

    const webhook = template?.workflow.nodes.find((node) => node.name === 'Webhook Trigger');
    expect(webhook?.parameters).toMatchObject({ httpMethod: 'POST', path: 'approval-trigger' });

    const actions = template?.workflow.nodes.filter((node) => node.type === 'CUSTOM.workflowInteractionLayer');
    expect(actions).toHaveLength(2);
    expect(actions?.map((node) => node.parameters)).toEqual([
      expect.objectContaining({
        operation: 'create',
        actorType: 'user',
        actionType: 'showform',
        callbackMethod: 'POST',
        callbackUrl: "={{ $execution.resumeUrl + '&actor=alice' }}",
      }),
      expect.objectContaining({
        operation: 'create',
        actorType: 'user',
        actionType: 'showform',
        callbackMethod: 'POST',
        callbackUrl: "={{ $execution.resumeUrl + '&actor=bob' }}",
      }),
    ]);

    const wait = template?.workflow.nodes.find((node) => node.type === 'CUSTOM.multiWebhookWait');
    expect(wait?.parameters).toMatchObject({ operation: 'wait', useStaticExpectedCalls: false });
    expect(JSON.parse(String(wait?.parameters.expectedCallsDynamic))).toEqual([
      { queryParam: 'actor', queryValue: 'alice' },
      { queryParam: 'actor', queryValue: 'bob' },
    ]);
    expect(template?.workflow.connections['Multi Webhook Wait Node']).toBeDefined();
  });

  it('ships every documented Adaptive Card notification workflow in Preview mode', () => {
    const library = loadTemplateLibrary(ASSETS_DIR);
    const scenarios = [
      [4001, 'devx/deployment-status'],
      [4002, 'devx/dns-routing-change'],
      [4003, 'devx/grafana-alert'],
      [4004, 'devx/sysdig-alert-card'],
      [4005, 'devx/github-secret-scanning-alert'],
    ] as const;

    for (const [id, webhookPath] of scenarios) {
      const template = library.templatesById.get(id);
      const webhook = template?.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.webhook');
      const code = template?.workflow.nodes.find((node) => node.type === 'n8n-nodes-base.code');
      const connector = template?.workflow.nodes.find((node) => node.type === 'CUSTOM.devXMessageConnector');

      expect(template, `template ${id}`).toBeDefined();
      expect(template?.workflow.nodes).toHaveLength(3);
      expect(template?.workflow.nodes.every((node) => node.credentials === undefined)).toBe(true);
      expect((template?.workflow as Record<string, unknown> | undefined)?.pinData).toBeUndefined();
      expect(webhook?.parameters).toMatchObject({
        httpMethod: 'POST',
        path: webhookPath,
        responseMode: 'onReceived',
      });
      expect(code?.parameters.mode).toBe('runOnceForAllItems');
      expect(code?.parameters.jsCode).toEqual(expect.any(String));
      expect(connector?.parameters).toMatchObject({
        type: 'card',
        payload: '={{ $json.cardJson }}',
        mode: 'preview',
      });
      expect(template?.workflow.connections.Webhook).toBeDefined();
      expect(template?.workflow.connections['Build Adaptive Card']).toBeDefined();
    }

    expect(library.templatesById.get(4004)?.workflow.nodes[0].parameters.authentication).toBe('headerAuth');
    expect(library.templatesById.get(4005)?.workflow.nodes[0].parameters.authentication).toBe('headerAuth');
    expect(library.templatesById.get(4005)?.workflow.settings).toMatchObject({
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveDataManualExecutions: false,
      saveExecutionProgress: false,
    });
    expect(library.collectionsById.get(4)?.workflowIds).toEqual(scenarios.map(([id]) => id));

    const webhookPaths = library.templates.flatMap((template) =>
      template.workflow.nodes
        .filter((node) => node.type === 'n8n-nodes-base.webhook')
        .map((node) => node.parameters.path),
    );
    expect(new Set(webhookPaths).size).toBe(webhookPaths.length);
  });

  it('applies defaults and strips credentials from graph nodes', () => {
    const dir = makeTempDir();
    writeTemplate(dir, 'with-credentials', {
      ...makeTemplate(1, 'Has credentials'),
      workflow: {
        nodes: [
          {
            name: 'Postgres',
            type: 'n8n-nodes-base.postgres',
            position: [0, 0],
            credentials: { postgres: { id: 'secret-id', name: 'prod' } },
          },
        ],
        connections: {},
        pinData: { Postgres: [{ json: { token: 'must-not-be-published' } }] },
      },
    });

    const library = loadTemplateLibrary(dir);
    const node = library.templates[0].workflow.nodes[0] as Record<string, unknown>;

    expect(node.credentials).toBeUndefined();
    expect((library.templates[0].workflow as Record<string, unknown>).pinData).toBeUndefined();
    expect(library.templates[0].totalViews).toBe(0);
    expect(library.templates[0].image).toEqual([]);
    expect(library.templates[0].user).toEqual({
      username: 'tester',
      name: '',
      avatar: '',
      verified: false,
    });
  });

  it('skips invalid JSON and schema mismatches instead of throwing', () => {
    const dir = makeTempDir();
    writeTemplate(dir, 'valid', makeTemplate(1, 'Valid'));
    writeTemplate(dir, 'broken-json', '{ not json');
    writeTemplate(dir, 'wrong-shape', { id: 'not-a-number', name: '' });
    mkdirSync(path.join(dir, 'empty-dir'));

    const library = loadTemplateLibrary(dir);

    expect(library.templates.map((template) => template.name)).toEqual(['Valid']);
  });

  it('keeps the first template when ids collide', () => {
    const dir = makeTempDir();
    writeTemplate(dir, 'a-first', makeTemplate(7, 'First'));
    writeTemplate(dir, 'b-second', makeTemplate(7, 'Second'));

    const library = loadTemplateLibrary(dir);

    expect(library.templates).toHaveLength(1);
    expect(library.templates[0].name).toBe('First');
  });

  it('orders templates by rank and resolves collections against loaded templates', () => {
    const dir = makeTempDir();
    writeTemplate(dir, 'later', makeTemplate(2, 'Later', { rank: 10 }));
    writeTemplate(dir, 'earlier', makeTemplate(1, 'Earlier', { rank: 1 }));
    writeFileSync(
      path.join(dir, 'collections.json'),
      JSON.stringify({
        collections: [
          {
            id: 5,
            name: 'Mixed',
            createdAt: '2026-01-01T00:00:00.000Z',
            workflowIds: [2, 1, 999],
          },
        ],
      }),
    );

    const library = loadTemplateLibrary(dir);

    expect(library.templates.map((template) => template.name)).toEqual(['Earlier', 'Later']);
    // 999 does not exist, so it is dropped from the collection.
    expect(library.collections[0].workflowIds).toEqual([2, 1]);
  });

  it('rejects missing category and node descriptor ids', () => {
    const dir = makeTempDir();
    writeTemplate(dir, 'missing-category-id', {
      ...makeTemplate(1, 'Missing category id'),
      categories: [{ name: 'Starter' }],
    });
    writeTemplate(dir, 'missing-descriptor-id', {
      ...makeTemplate(2, 'Missing descriptor id'),
      nodes: [{ name: 'n8n-nodes-base.manualTrigger', displayName: 'Manual Trigger' }],
    });

    const library = loadTemplateLibrary(dir);

    expect(library.templates).toEqual([]);
  });

  it('keeps the first collection when ids collide', () => {
    const dir = makeTempDir();
    writeTemplate(dir, 'template', makeTemplate(1, 'Template'));
    writeFileSync(
      path.join(dir, 'collections.json'),
      JSON.stringify({
        collections: [
          { id: 5, name: 'First', createdAt: '2026-01-01T00:00:00.000Z', workflowIds: [1] },
          { id: 5, name: 'Second', createdAt: '2026-01-01T00:00:00.000Z', workflowIds: [1] },
        ],
      }),
    );

    const library = loadTemplateLibrary(dir);

    expect(library.collections).toHaveLength(1);
    expect(library.collections[0].name).toBe('First');
    expect(library.collectionsById.get(5)?.name).toBe('First');
  });

  it('normalizes relative image URLs for template and collection records', () => {
    const record = {
      image: [
        { id: 1, url: '/assets/template.png' },
        { id: 2, url: 'https://cdn.example/template.png' },
      ],
    };

    expect(absolutizeImageUrls(record, 'https://n8n.example/')).toEqual({
      image: [
        { id: 1, url: 'https://n8n.example/assets/template.png' },
        { id: 2, url: 'https://cdn.example/template.png' },
      ],
    });
  });

  it('returns an empty library when the directory is missing', () => {
    const library = loadTemplateLibrary(path.join(makeTempDir(), 'nope'));

    expect(library.templates).toEqual([]);
    expect(library.collections).toEqual([]);
    expect(library.categories).toEqual([]);
  });
});
