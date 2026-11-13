"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const vitest_1 = require("vitest");
const readonly_1 = require("../../../src/api/constants/readonly");
const readonly_n8n_routes_1 = require("../../../src/api/bootstrap/readonly-n8n-routes");
let server;
(0, vitest_1.afterEach)(() => {
    server?.close();
    server = undefined;
});
// Mirrors n8n: its routes are registered before the ready hook adds the block.
async function start(isReadOnly) {
    const app = (0, express_1.default)();
    const n8nRouter = (0, express_1.Router)();
    n8nRouter.all('/:id/:action', (_req, res) => {
        res.status(200).json({ reachedN8n: true });
    });
    app.use('/rest/workflows', n8nRouter);
    app.use('/rest/credentials', n8nRouter);
    app.use('/rest/folders', n8nRouter);
    app.use('/api/v1/workflows', n8nRouter);
    app.use('/api/v1/credentials', n8nRouter);
    (0, readonly_n8n_routes_1.blockN8nEditRoutes)(app, isReadOnly);
    server = await new Promise((resolve) => {
        const listening = app.listen(0, () => resolve(listening));
    });
    const { port } = server.address();
    return (method, path) => fetch(`http://127.0.0.1:${port}${path}`, { method });
}
const BLOCKED = [
    ['POST', '/rest/workflows/wf-1/archive'],
    ['POST', '/rest/workflows/wf-1/unarchive'],
    ['PUT', '/rest/workflows/wf-1/share'],
    ['PUT', '/rest/workflows/wf-1/transfer'],
    ['PUT', '/rest/credentials/cred-1/share'],
    ['PUT', '/rest/credentials/cred-1/transfer'],
    ['PUT', '/rest/folders/folder-1/transfer'],
    ['POST', '/api/v1/workflows/wf-1/archive'],
    ['POST', '/api/v1/workflows/wf-1/unarchive'],
    ['PUT', '/api/v1/workflows/wf-1/transfer'],
    ['PUT', '/api/v1/credentials/cred-1/transfer'],
];
(0, vitest_1.describe)('blockN8nEditRoutes', () => {
    (0, vitest_1.describe)('in read-only mode', () => {
        vitest_1.it.each(BLOCKED)('answers %s %s with a 503 before n8n handles it', async (method, path) => {
            const request = await start(true);
            const response = await request(method, path);
            (0, vitest_1.expect)(response.status).toBe(503);
            (0, vitest_1.expect)(await response.json()).toEqual({
                code: 503,
                message: readonly_1.READONLY_EDIT_MESSAGE,
                details: { code: readonly_1.READONLY_MAINTENANCE_CODE },
            });
        });
        vitest_1.it.each([
            ['POST', '/REST/workflows/wf-1/ARCHIVE'],
            ['PUT', '/rest/Credentials/cred-1/Share'],
            ['POST', '/rest/workflows/wf-1/archive/'],
        ])('answers %s %s with a 503 however it is written, as n8n would still handle it', async (method, path) => {
            const request = await start(true);
            const response = await request(method, path);
            (0, vitest_1.expect)(response.status).toBe(503);
        });
        vitest_1.it.each([
            ['GET', '/rest/workflows/wf-1/archive'],
            ['PATCH', '/rest/workflows/wf-1/share'],
            ['POST', '/rest/workflows/wf-1/activate'],
            ['PUT', '/rest/workflows/wf-1/activate'],
            ['POST', '/rest/folders/folder-1/transfer'],
            ['PUT', '/api/v1/workflows/wf-1/share'],
            ['PUT', '/api/v1/credentials/cred-1/share'],
        ])('lets %s %s through to n8n', async (method, path) => {
            const request = await start(true);
            const response = await request(method, path);
            (0, vitest_1.expect)(response.status).toBe(200);
            (0, vitest_1.expect)(await response.json()).toEqual({ reachedN8n: true });
        });
        (0, vitest_1.it)('fails at startup instead of moving a layer that is not the block', () => {
            const n8nLayer = { handle: () => undefined };
            const stack = [n8nLayer];
            const app = { use: vitest_1.vi.fn(), router: { stack } };
            (0, vitest_1.expect)(() => (0, readonly_n8n_routes_1.blockN8nEditRoutes)(app, true)).toThrow('read-only block was not added where expected');
            (0, vitest_1.expect)(stack).toEqual([n8nLayer]);
        });
        (0, vitest_1.it)('fails at startup when the route list is not found', () => {
            const app = { use: vitest_1.vi.fn(), router: {} };
            (0, vitest_1.expect)(() => (0, readonly_n8n_routes_1.blockN8nEditRoutes)(app, true)).toThrow('route list was not found');
            (0, vitest_1.expect)(app.use).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('on Gold', () => {
        vitest_1.it.each(BLOCKED)('lets %s %s through to n8n', async (method, path) => {
            const request = await start(false);
            const response = await request(method, path);
            (0, vitest_1.expect)(response.status).toBe(200);
            (0, vitest_1.expect)(await response.json()).toEqual({ reachedN8n: true });
        });
    });
});
