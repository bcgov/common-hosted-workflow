import { describe, expect, it, vi } from 'vitest';
import { GOLDDR_MAINTENANCE_CODE, GOLDDR_WRITE_MESSAGE } from '../../../src/api/constants/golddr';
import { createGoldDrMaintenanceMiddleware } from '../../../src/api/middlewares/golddr-maintenance';
import { AppError } from '../../../src/api/utils/errors';
import { createMockNext, createMockRequest, createMockResponse } from '../../helpers/mocks';

function run(isGoldDr: boolean, method: string, path = '/anything') {
  const middleware = createGoldDrMaintenanceMiddleware(isGoldDr);
  const req = createMockRequest({ method, path } as any);
  const res = createMockResponse() as any;
  res.setHeader = vi.fn();
  const next = createMockNext();

  middleware(req, res, next);

  return { res, next };
}

describe('GoldDR maintenance middleware', () => {
  describe('on Gold', () => {
    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('lets %s through', (method) => {
      const { res, next } = run(false, method);

      expect(next).toHaveBeenCalledWith();
      expect(res.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('on GoldDR', () => {
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
      expect(error.message).toBe(GOLDDR_WRITE_MESSAGE);
      expect(error.details).toEqual({ code: GOLDDR_MAINTENANCE_CODE });
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
  });
});
