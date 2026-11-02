import { beforeEach, describe, expect, it, vi } from 'vitest';

const { stubRouter, reachedHandler } = await vi.hoisted(async () => {
  const { Router } = await import('express');
  const reachedHandler = vi.fn();
  const stubRouter = () => {
    const router = Router();
    router.use((req, res) => {
      reachedHandler(req.method, req.url);
      res.status(200).json({ reached: true });
    });
    return router;
  };
  return { stubRouter, reachedHandler };
});

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/config')>();
  return { ...original, READONLY_MODE: true };
});
vi.mock('../../../src/api/swagger-ui', () => ({ mountSwaggerUi: vi.fn() }));
vi.mock('../../../src/api/routes/actions', () => ({ buildActionRouter: () => stubRouter() }));
vi.mock('../../../src/api/routes/actors', () => ({ buildActorRouter: () => stubRouter() }));
vi.mock('../../../src/api/routes/admin', () => ({ buildAdminRouter: () => stubRouter() }));
vi.mock('../../../src/api/routes/chefs-submission', () => ({ buildChefsSubmissionRouter: () => stubRouter() }));
vi.mock('../../../src/api/routes/grafana-projects', () => ({ buildGrafanaProjectsRouter: () => stubRouter() }));
vi.mock('../../../src/api/routes/messages', () => ({ buildMessageRouter: () => stubRouter() }));
vi.mock('../../../src/api/routes/multi-webhook-wait', () => ({ buildMultiWebhookWaitRouter: () => stubRouter() }));

import { mountCustomApi } from '../../../src/api/bootstrap/custom-api';
import { AppError } from '../../../src/api/utils/errors';

function dispatch(method: string, url: string) {
  const app = { use: vi.fn() };
  mountCustomApi(app as any, {} as any);
  const [, v1Router] = app.use.mock.calls.find(([path]) => path === '/rest/custom/v1') as [string, any];

  return new Promise<{ error: unknown; responded: boolean }>((resolve) => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(() => resolve({ error: null, responded: true })),
      setHeader: vi.fn(),
    };
    v1Router.handle({ method, url, path: url, headers: {} }, res, (error: unknown) =>
      resolve({ error, responded: false }),
    );
  });
}

beforeEach(() => {
  reachedHandler.mockClear();
});

describe('mountCustomApi in read-only mode', () => {
  it.each([
    ['POST', '/admin/associate-workflow'],
    ['POST', '/chefs/submissions'],
    ['POST', '/messages/'],
    ['POST', '/actions'],
    ['PATCH', '/actions/action-1'],
    ['PATCH', '/actors/actor-1/actions/action-1'],
  ])('blocks %s %s before any router handles it', async (method, url) => {
    const { error, responded } = await dispatch(method, url);

    expect(responded).toBe(false);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).statusCode).toBe(503);
    expect(reachedHandler).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/admin/users/person@example.com/project'],
    ['GET', '/messages/'],
    ['GET', '/actions'],
    ['GET', '/multi-webhook-wait/status'],
    ['GET', '/obs/projects'],
    ['POST', '/multi-webhook-wait/register'],
    ['POST', '/multi-webhook-wait/callback/exec-1'],
    ['DELETE', '/multi-webhook-wait/cleanup/exec-1'],
    ['POST', '/chefs/submissions/register'],
    ['POST', '/chefs/waste-management'],
  ])('lets %s %s through to the router', async (method, url) => {
    const { error, responded } = await dispatch(method, url);

    expect(error).toBeNull();
    expect(responded).toBe(true);
    expect(reachedHandler).toHaveBeenCalledWith(method, expect.any(String));
  });
});
