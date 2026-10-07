/**
 * Route tests for n8n-node triggers in `src/api/routes/triggers.ts`:
 * `POST /triggers/:triggerId/callback` (node branch) and `GET /trigger-targets`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveWilTenantProjectIdsMock } = vi.hoisted(() => ({ resolveWilTenantProjectIdsMock: vi.fn() }));

vi.mock('../../../src/api/routes/helpers/wil-tenant', () => ({
  resolveWilTenantProjectIds: resolveWilTenantProjectIdsMock,
  extractTenantId: vi.fn(),
}));

import { buildTriggerRouter } from '../../../src/api/routes/triggers';
import { createMockRequest, createMockResponse, makeWorkflowTriggerRow } from '../../helpers/mocks';
import { getRouteHandlers, runHandlerChain } from '../../helpers/test-utils';
import { AppError } from '../../../src/api/utils/errors';

const TENANT_ID = 'tenant-1';
const PROJECT_IDS = ['proj-1'];

const nodeTrigger = (overrides: Record<string, unknown> = {}) =>
  makeWorkflowTriggerRow({
    targetKind: 'n8n-node',
    targetWorkflowId: 'wf1',
    targetNodeId: 'node1',
    triggerUrl: null,
    triggerMethod: null,
    allowedActorsType: 'all',
    allowedActors: ['*'],
    metadata: { buttonText: 'Go', inputValues: { amount: 5 } },
    ...overrides,
  });

const target = (overrides: Record<string, unknown> = {}) => ({
  workflowId: 'wf1',
  workflowName: 'Flow',
  projectId: 'proj-1',
  nodeId: 'node1',
  nodeName: 'WIL Trigger',
  label: 'Go',
  description: '',
  acceptedSources: ['button'],
  inputSource: 'passthrough',
  inputSchema: [],
  respondMode: 'immediately',
  responseTimeoutSec: 30,
  ...overrides,
});

function setup(opts: { trigger?: unknown; resolve?: unknown; start?: unknown; manager?: boolean } = {}) {
  const services = {
    trigger: { getById: vi.fn().mockResolvedValue(opts.trigger ?? nodeTrigger()), list: vi.fn().mockResolvedValue([]) },
    triggerTarget: {
      resolve: vi
        .fn()
        .mockResolvedValue(
          opts.resolve ?? { ok: true, target: target(), published: { workflow: {}, projectId: 'proj-1' } },
        ),
      list: vi.fn().mockResolvedValue([target()]),
      statuses: vi.fn().mockResolvedValue(new Map()),
    },
    workflowRunner: {
      start: vi.fn().mockResolvedValue(opts.start ?? { executionId: 'exec-1', status: 'dispatched' }),
    },
  };
  const customRepositories = {
    tenantProjectRelation: {
      getRowByTenantId: vi.fn().mockResolvedValue({ projectType: 'team', projectId: 'proj-1' }),
    },
  };
  const router = buildTriggerRouter({ services, customRepositories, n8nRepositories: {} } as any);
  const session = {
    email: 'actor@example.com',
    n8nUser: null,
    tenantRoles: [{ tenantId: TENANT_ID, roles: opts.manager ? ['project:editor'] : ['viewer'] }],
    tenantGroups: [],
  };
  return { router, services, session };
}

async function callback(ctx: ReturnType<typeof setup>) {
  const handlers = getRouteHandlers(ctx.router, 'post', '/triggers/:triggerId/callback')!;
  const req = createMockRequest({ params: { triggerId: 'trigger-001' }, body: {}, session: ctx.session } as any);
  const res = createMockResponse();
  const error = await runHandlerChain(handlers, req, res);
  return { error, res };
}

beforeEach(() => {
  resolveWilTenantProjectIdsMock.mockReset();
  resolveWilTenantProjectIdsMock.mockResolvedValue({ tenantId: TENANT_ID, projectIds: PROJECT_IDS });
});

describe('POST /triggers/:triggerId/callback (n8n-node target)', () => {
  it('starts the node with the WIL item and answers 202 with the execution id', async () => {
    const ctx = setup();
    const { error, res } = await callback(ctx);

    expect(error).toBeNull();
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ success: true, executionId: 'exec-1' });

    const call = ctx.services.workflowRunner.start.mock.calls[0][0];
    expect(call.startNodeId).toBe('node1');
    expect(call.wait).toBeUndefined();
    expect(call.items[0].json).toMatchObject({
      source: 'wil',
      trigger: { id: 'trigger-001', type: 'button', name: 'Go' },
      actor: { email: 'actor@example.com', tenantId: TENANT_ID, roles: ['viewer'] },
      input: { amount: 5 },
    });
    expect(ctx.services.triggerTarget.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: 'wf1', nodeId: 'node1', projectIds: PROJECT_IDS, source: 'button' }),
    );
  });

  it('waits for the last node and returns its result with 200', async () => {
    const ctx = setup({
      resolve: { ok: true, target: target({ respondMode: 'lastNode', responseTimeoutSec: 7 }), published: {} },
      start: { executionId: 'exec-2', status: 'succeeded', result: { approved: true } },
    });
    const { res } = await callback(ctx);

    expect(ctx.services.workflowRunner.start.mock.calls[0][0].wait).toEqual({ timeoutMs: 7000 });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, executionId: 'exec-2', result: { approved: true } });
  });

  it('answers 202 when a lastNode run is still going after the timeout', async () => {
    const ctx = setup({
      resolve: { ok: true, target: target({ respondMode: 'lastNode' }), published: {} },
      start: { executionId: 'exec-3', status: 'dispatched' },
    });
    const { res } = await callback(ctx);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it('answers 502 when the run fails', async () => {
    const ctx = setup({ start: { executionId: 'exec-4', status: 'failed' } });
    const { res } = await callback(ctx);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json.mock.calls[0][0].error).toMatchObject({ executionId: 'exec-4' });
  });

  it('fails with 409 and does not run when the target is no longer live', async () => {
    const ctx = setup({ resolve: { ok: false, reason: 'unpublished' } });
    const { error } = await callback(ctx);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(409);
    expect((error as AppError).details).toMatchObject({ code: 'WIL_TARGET_UNAVAILABLE', reason: 'unpublished' });
    expect(ctx.services.workflowRunner.start).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not allowed (403) without touching n8n', async () => {
    const ctx = setup({ trigger: nodeTrigger({ allowedActorsType: 'user', allowedActors: ['someone@else.com'] }) });
    const { res } = await callback(ctx);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(ctx.services.triggerTarget.resolve).not.toHaveBeenCalled();
  });

  it('never calls the webhook path for node targets', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await callback(setup());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('GET /trigger-targets', () => {
  async function list(ctx: ReturnType<typeof setup>, query: Record<string, unknown> = { source: 'button' }) {
    const handlers = getRouteHandlers(ctx.router, 'get', '/trigger-targets')!;
    const req = createMockRequest({ query, session: ctx.session } as any);
    const res = createMockResponse();
    const error = await runHandlerChain(handlers, req, res);
    return { error, res };
  }

  it('lists targets for managers, filtered by source', async () => {
    const ctx = setup({ manager: true });
    const { res } = await list(ctx);
    expect(ctx.services.triggerTarget.list).toHaveBeenCalledWith({ projectIds: PROJECT_IDS, source: 'button' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ enabled: true, data: [{ workflowId: 'wf1', nodeId: 'node1' }] });
  });

  it('is manager-only', async () => {
    const ctx = setup({ manager: false });
    const { res } = await list(ctx);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(ctx.services.triggerTarget.list).not.toHaveBeenCalled();
  });

  it('rejects an unknown source', async () => {
    const { error } = await list(setup({ manager: true }), { source: 'bogus' });
    expect(error).toBeTruthy();
  });
});
