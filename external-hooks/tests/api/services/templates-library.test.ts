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
