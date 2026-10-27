import type { AddressInfo } from 'net';
import type { Server } from 'http';
import express, { Router, type Express } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GOLDDR_EDIT_MESSAGE, GOLDDR_MAINTENANCE_CODE } from '../../../src/api/constants/golddr';
import { blockN8nEditRoutes } from '../../../src/api/bootstrap/golddr-n8n-routes';

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

// Mirrors n8n: its routes are registered before the ready hook adds the block.
async function start(isGoldDr: boolean) {
  const app = express();
  const n8nRouter = Router();
  n8nRouter.all('/:id/:action', (_req, res) => {
    res.status(200).json({ reachedN8n: true });
  });
  app.use('/rest/workflows', n8nRouter);
  app.use('/rest/credentials', n8nRouter);
  app.use('/rest/folders', n8nRouter);
  app.use('/api/v1/workflows', n8nRouter);
  app.use('/api/v1/credentials', n8nRouter);

  blockN8nEditRoutes(app, isGoldDr);

  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;

  return (method: string, path: string) => fetch(`http://127.0.0.1:${port}${path}`, { method });
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

describe('blockN8nEditRoutes', () => {
  describe('on GoldDR', () => {
    it.each(BLOCKED)('answers %s %s with a 503 before n8n handles it', async (method, path) => {
      const request = await start(true);

      const response = await request(method, path);

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        code: 503,
        message: GOLDDR_EDIT_MESSAGE,
        details: { code: GOLDDR_MAINTENANCE_CODE },
      });
    });

    it.each([
      ['POST', '/REST/workflows/wf-1/ARCHIVE'],
      ['PUT', '/rest/Credentials/cred-1/Share'],
      ['POST', '/rest/workflows/wf-1/archive/'],
    ])('answers %s %s with a 503 however it is written, as n8n would still handle it', async (method, path) => {
      const request = await start(true);

      const response = await request(method, path);

      expect(response.status).toBe(503);
    });

    it.each([
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

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ reachedN8n: true });
    });

    it('fails at startup instead of moving a layer that is not the block', () => {
      const n8nLayer = { handle: () => undefined };
      const stack = [n8nLayer];
      const app = { use: vi.fn(), router: { stack } } as unknown as Express;

      expect(() => blockN8nEditRoutes(app, true)).toThrow('last Express layer is not the block');
      expect(stack).toEqual([n8nLayer]);
    });

    it('fails at startup when the Express route list is not found', () => {
      const app = { use: vi.fn(), router: {} } as unknown as Express;

      expect(() => blockN8nEditRoutes(app, true)).toThrow('Express route list was not found');
      expect(app.use).not.toHaveBeenCalled();
    });
  });

  describe('on Gold', () => {
    it.each(BLOCKED)('lets %s %s through to n8n', async (method, path) => {
      const request = await start(false);

      const response = await request(method, path);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ reachedN8n: true });
    });
  });
});
