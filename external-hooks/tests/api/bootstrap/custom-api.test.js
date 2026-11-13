'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
const vitest_1 = require('vitest');
const { stubRouter, reachedHandler } = await vitest_1.vi.hoisted(async () => {
  const { Router } = await Promise.resolve().then(() => __importStar(require('express')));
  const reachedHandler = vitest_1.vi.fn();
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
vitest_1.vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, READONLY_MODE: true };
});
vitest_1.vi.mock('../../../src/api/swagger-ui', () => ({ mountSwaggerUi: vitest_1.vi.fn() }));
vitest_1.vi.mock('../../../src/api/routes/actions', () => ({ buildActionRouter: () => stubRouter() }));
vitest_1.vi.mock('../../../src/api/routes/actors', () => ({ buildActorRouter: () => stubRouter() }));
vitest_1.vi.mock('../../../src/api/routes/admin', () => ({ buildAdminRouter: () => stubRouter() }));
vitest_1.vi.mock('../../../src/api/routes/chefs-submission', () => ({
  buildChefsSubmissionRouter: () => stubRouter(),
}));
vitest_1.vi.mock('../../../src/api/routes/grafana-projects', () => ({
  buildGrafanaProjectsRouter: () => stubRouter(),
}));
vitest_1.vi.mock('../../../src/api/routes/messages', () => ({ buildMessageRouter: () => stubRouter() }));
vitest_1.vi.mock('../../../src/api/routes/multi-webhook-wait', () => ({
  buildMultiWebhookWaitRouter: () => stubRouter(),
}));
const custom_api_1 = require('../../../src/api/bootstrap/custom-api');
const errors_1 = require('../../../src/api/utils/errors');
function dispatch(method, url) {
  const app = { use: vitest_1.vi.fn() };
  (0, custom_api_1.mountCustomApi)(app, {});
  const [, v1Router] = app.use.mock.calls.find(([path]) => path === '/rest/custom/v1');
  return new Promise((resolve) => {
    const res = {
      status: vitest_1.vi.fn().mockReturnThis(),
      json: vitest_1.vi.fn(() => resolve({ error: null, responded: true })),
      setHeader: vitest_1.vi.fn(),
    };
    v1Router.handle({ method, url, path: url, headers: {} }, res, (error) => resolve({ error, responded: false }));
  });
}
(0, vitest_1.beforeEach)(() => {
  reachedHandler.mockClear();
});
(0, vitest_1.describe)('mountCustomApi in read-only mode', () => {
  vitest_1.it.each([
    ['POST', '/admin/associate-workflow'],
    ['POST', '/chefs/submissions'],
    ['POST', '/messages/'],
    ['POST', '/actions'],
    ['PATCH', '/actions/action-1'],
    ['PATCH', '/actors/actor-1/actions/action-1'],
  ])('blocks %s %s before any router handles it', async (method, url) => {
    const { error, responded } = await dispatch(method, url);
    (0, vitest_1.expect)(responded).toBe(false);
    (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
    (0, vitest_1.expect)(error.statusCode).toBe(503);
    (0, vitest_1.expect)(reachedHandler).not.toHaveBeenCalled();
  });
  vitest_1.it.each([
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
    (0, vitest_1.expect)(error).toBeNull();
    (0, vitest_1.expect)(responded).toBe(true);
    (0, vitest_1.expect)(reachedHandler).toHaveBeenCalledWith(method, vitest_1.expect.any(String));
  });
});
