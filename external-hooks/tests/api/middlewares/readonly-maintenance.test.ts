import { describe, expect, it, vi } from 'vitest';
import { READONLY_MAINTENANCE_CODE, READONLY_WRITE_MESSAGE } from '../../../src/api/constants/readonly';
import { createReadOnlyMiddleware } from '../../../src/api/middlewares/readonly-maintenance';
import { AppError } from '../../../src/api/utils/errors';
import { createMockNext, createMockRequest, createMockResponse } from '../../helpers/mocks';

function run(isReadOnly: boolean, method: string, path = '/anything') {
  const middleware = createReadOnlyMiddleware(isReadOnly);
  const req = createMockRequest({ method, path } as any);
  const res = createMockResponse() as any;
  res.setHeader = vi.fn();
  const next = createMockNext();

  middleware(req, res, next);

  return { res, next };
}

describe('read-only maintenance middleware', () => {
  describe('on Gold', () => {
    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('lets %s through', (method) => {
      const { res, next } = run(false, method);

      expect(next).toHaveBeenCalledWith();
      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('in read-only mode', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('lets %s through so reads keep working', (method) => {
      const { res, next } = run(true, method);

      expect(next).toHaveBeenCalledWith();
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('answers %s with a 503 maintenance error', (method) => {
      const { res, next } = run(true, method);

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0] as AppError;
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(503);
      expect(error.message).toBe(READONLY_WRITE_MESSAGE);
      expect(error.details).toEqual({ code: READONLY_MAINTENANCE_CODE });
      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('lets the read-only CHEFS token POST through so forms still display', () => {
      const { next } = run(true, 'POST', '/triggers/trigger-1/chefs-token');

      expect(next).toHaveBeenCalledWith();
    });

    it('does not exempt other POSTs that merely contain chefs-token in the path', () => {
      const { next } = run(true, 'POST', '/chefs-token/extra');

      expect((next.mock.calls[0][0] as AppError).statusCode).toBe(503);
    });

    it.each([
      ['POST', '/multi-webhook-wait/register'],
      ['POST', '/multi-webhook-wait/callback/exec-1'],
      ['DELETE', '/multi-webhook-wait/cleanup/exec-1'],
      ['POST', '/chefs/submissions/register'],
      ['POST', '/chefs/waste-management'],
    ])('lets %s %s through because running workflows call it', (method, path) => {
      const { res, next } = run(true, method, path);

      expect(next).toHaveBeenCalledWith();
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('still blocks other CHEFS submission writes', () => {
      const { next } = run(true, 'POST', '/chefs/submissions');

      expect((next.mock.calls[0][0] as AppError).statusCode).toBe(503);
    });
  });
});
