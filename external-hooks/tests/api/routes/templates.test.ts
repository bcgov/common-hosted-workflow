/**
 * Unit tests for the custom template library routes in
 * `src/api/routes/templates.ts` (mounted at /rest/custom/v1).
 *
 * The router is built from the real static library in
 * `src/api/assets/templates`, so these tests also act as a contract check on
 * the sample data: every endpoint the n8n editor calls is exercised.
 */
import { describe, expect, it } from 'vitest';
import path from 'node:path';

import { buildTemplatesRouter } from '../../../src/api/routes/templates';
import { loadTemplateLibrary } from '../../../src/api/services/templates/library';
import { createMockRequest, createMockResponse } from '../../helpers/mocks';
import { getRouteHandlers } from '../../helpers/test-utils';

// Read the repo's real templates explicitly: `EXTERNAL_HOOK_ASSETS_PATH` is
// only set inside the container, where it points at /external-hooks/api/assets.
const library = loadTemplateLibrary(path.join(process.cwd(), 'src/api/assets/templates'));
const router = buildTemplatesRouter(library);

/**
 * Like `runHandlerChain`, but also resolves when a *synchronous* handler
 * returns without calling `next` (every handler here writes the response and
 * returns). The shared helper only resolves on `next` or on a promise.
 */
async function runHandlers(
  handlers: Array<(req: any, res: any, next: any) => any>,
  req: any,
  res: any,
): Promise<unknown> {
  let error: unknown = null;

  for (const handler of handlers) {
    if (error) break;

    await new Promise<void>((resolve) => {
      let settled = false;
      const settle = (err?: unknown) => {
        if (settled) return;
        settled = true;
        if (err) error = err;
        resolve();
      };

      const next = (err?: unknown) => settle(err);
      const result = handler(req, res, next);

      if (result && typeof result.then === 'function') {
        result.then(() => settle()).catch((err: unknown) => settle(err));
      } else {
        settle();
      }
    });
  }

  return error;
}

async function callRoute(
  method: 'get',
  path: string,
  { query = {}, params = {} }: { query?: Record<string, unknown>; params?: Record<string, unknown> } = {},
) {
  const handlers = getRouteHandlers(router, method, path);
  if (!handlers) throw new Error(`No handler registered for ${method.toUpperCase()} ${path}`);

  const req = createMockRequest({ query, params } as any);
  const res = createMockResponse();

  const error = await runHandlers(handlers, req, res);
  if (error) throw error;

  return {
    status: res.status.mock.calls[0]?.[0] as number,
    body: res.json.mock.calls[0]?.[0] as any,
  };
}

describe('templates router', () => {
  it('answers the health check the editor probes on boot', async () => {
    const { status, body } = await callRoute('get', '/health');

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });

  it('lists the categories referenced by templates and collections', async () => {
    const { status, body } = await callRoute('get', '/templates/categories');

    expect(status).toBe(200);
    expect(body.categories.map((category: { name: string }) => category.name)).toEqual(
      expect.arrayContaining(['Starter', 'Data & Storage', 'Development']),
    );
    expect(body.categories[0]).toEqual(expect.objectContaining({ id: expect.any(Number), name: expect.any(String) }));
  });

  it('searches templates and paginates with the editor defaults', async () => {
    const { status, body } = await callRoute('get', '/templates/search');

    expect(status).toBe(200);
    expect(body.totalWorkflows).toBe(library.templates.length);
    expect(body.workflows).toHaveLength(Math.min(20, library.templates.length));
    expect(body.filters).toEqual([]);

    // List items are summaries: no workflow graph, no description.
    const first = body.workflows[0];
    expect(first).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        totalViews: expect.any(Number),
        createdAt: expect.any(String),
        user: expect.any(Object),
        nodes: expect.any(Array),
      }),
    );
    expect(first.workflow).toBeUndefined();
    expect(first.description).toBeUndefined();
  });

  it('respects page and limit', async () => {
    const { body } = await callRoute('get', '/templates/search', { query: { page: '2', limit: '1' } });

    expect(body.totalWorkflows).toBe(library.templates.length);
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0].id).toBe(library.templates[1].id);
  });

  it('filters search by category name, as the editor sends it', async () => {
    const { body } = await callRoute('get', '/templates/search', {
      query: { category: 'Communication' },
    });

    const expectedIds = library.templates
      .filter((template) => template.categories.some((category) => category.name === 'Communication'))
      .map((template) => template.id);
    expect(body.totalWorkflows).toBe(expectedIds.length);
    expect(body.workflows.map((workflow: { id: number }) => workflow.id)).toEqual(expectedIds);
  });

  it('filters search by node type, as the editor sends it', async () => {
    const { body } = await callRoute('get', '/templates/search', {
      query: { nodes: 'n8n-nodes-base.googleSheets' },
    });

    const expectedIds = library.templates
      .filter((template) => template.workflow.nodes.some((node) => node.type === 'n8n-nodes-base.googleSheets'))
      .map((template) => template.id);
    expect(body.totalWorkflows).toBe(expectedIds.length);
    expect(body.workflows.map((workflow: { id: number }) => workflow.id)).toEqual(expectedIds);
  });

  it('matches free text against the template name', async () => {
    const { body } = await callRoute('get', '/templates/search', { query: { search: 'webhook' } });

    expect(body.totalWorkflows).toBeGreaterThanOrEqual(1);
    expect(body.workflows.map((workflow: { id: number }) => workflow.id)).toContain(1002);
  });

  it('sorts by name when asked', async () => {
    const { body } = await callRoute('get', '/templates/search', { query: { sort: 'name' } });

    const names = body.workflows.map((workflow: { name: string }) => workflow.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
  });

  it('returns an empty page past the end of the results', async () => {
    const { body } = await callRoute('get', '/templates/search', { query: { page: '99' } });

    expect(body.totalWorkflows).toBe(library.templates.length);
    expect(body.workflows).toEqual([]);
  });

  it('lists collections and filters them by category id', async () => {
    const { status, body } = await callRoute('get', '/templates/collections');

    expect(status).toBe(200);
    expect(body.collections.length).toBeGreaterThanOrEqual(1);
    expect(body.collections.find((collection: { id: number }) => collection.id === 1)).toEqual(
      expect.objectContaining({
        id: 1,
        name: 'Starter pack',
        workflows: [{ id: 1002 }, { id: 1001 }, { id: 1003 }],
      }),
    );

    const filtered = await callRoute('get', '/templates/collections', {
      query: { category: '4' },
    });
    const expectedFiltered = library.collections.filter((collection) =>
      collection.categories.some((category) => category.id === 4),
    );
    expect(filtered.body.collections).toHaveLength(expectedFiltered.length);

    // n8n's axios serializer sends category[]=1&category[]=2 for collections.
    const arrayEncoded = await callRoute('get', '/templates/collections', {
      query: { 'category[]': ['1'] },
    });
    expect(arrayEncoded.body.collections.map((collection: { id: number }) => collection.id)).toContain(1);
  });

  it('returns a collection with full workflow details', async () => {
    const { status, body } = await callRoute('get', '/templates/collections/:id', {
      params: { id: '1' },
    });

    expect(status).toBe(200);
    expect(body.collection.id).toBe(1);
    expect(body.collection.description).toContain('Three templates');
    expect(body.collection.workflows).toHaveLength(3);
    // Collection members are detail projections, not `{ id }` stubs.
    expect(body.collection.workflows[0].workflow.nodes.length).toBeGreaterThan(0);
  });

  it('wraps template details in `{ workflow }` for the preview page', async () => {
    const { status, body } = await callRoute('get', '/templates/workflows/:id', {
      params: { id: '1001' },
    });

    expect(status).toBe(200);
    expect(body.workflow.id).toBe(1001);
    expect(body.workflow.description).toContain('What it does');
    expect(body.workflow.workflow.nodes.length).toBe(5);
    expect(body.workflow.workflowInfo).toEqual({
      nodeCount: 5,
      nodeTypes: {
        'n8n-nodes-base.scheduleTrigger': { count: 1 },
        'n8n-nodes-base.postgres': { count: 2 },
        'n8n-nodes-base.set': { count: 1 },
        'n8n-nodes-base.googleSheets': { count: 1 },
      },
    });
    expect(body.workflow.status).toBe('published');
  });

  it('returns the flat import payload for the use-template action', async () => {
    const { status, body } = await callRoute('get', '/workflows/templates/:id', {
      params: { id: '1002' },
    });

    expect(status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        id: 1002,
        name: expect.any(String),
        workflow: expect.objectContaining({
          nodes: expect.any(Array),
          connections: expect.any(Object),
        }),
      }),
    );
    // Flat on purpose: no `{ workflow: { workflow } }` nesting or pinned data.
    expect(body.workflow.workflow).toBeUndefined();
    expect(body.workflow.pinData).toBeUndefined();
  });

  it('404s unknown ids and non-numeric ids on every id route', async () => {
    for (const path of ['/templates/collections/:id', '/templates/workflows/:id', '/workflows/templates/:id']) {
      for (const id of ['999999', 'not-a-number']) {
        const { status, body } = await callRoute('get', path, { params: { id } });
        expect(status, `${path} ${id}`).toBe(404);
        expect(body.error.message).toBe('Not Found');
      }
    }
  });
});
