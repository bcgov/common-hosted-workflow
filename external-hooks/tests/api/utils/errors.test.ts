import { describe, expect, it, vi } from 'vitest';
import { AppError, wrapAsyncRoute, handleErrorResponse } from '../../../src/api/utils/errors';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers/mocks';

describe('AppError', () => {
  it('stores statusCode and message', () => {
    const err = new AppError(404, 'Not found');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('AppError');
  });

  it('stores optional details', () => {
    const err = new AppError(409, 'Conflict', { conflictId: 'abc' });
    expect(err.details).toEqual({ conflictId: 'abc' });
  });

  it('is an instance of Error', () => {
    const err = new AppError(500, 'Server error');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('wrapAsyncRoute', () => {
  it('calls next with error when async handler rejects', async () => {
    const error = new Error('boom');
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = wrapAsyncRoute(handler);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await wrapped(req, res as any, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not call next when handler resolves', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const wrapped = wrapAsyncRoute(handler);

    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    await wrapped(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
  });
});

describe('handleErrorResponse', () => {
  it('sends AppError status and message as JSON', () => {
    const err = new AppError(403, 'Forbidden');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    handleErrorResponse(err, req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        statusCode: 403,
        message: 'Forbidden',
      }),
    );
  });

  it('includes details from AppError', () => {
    const err = new AppError(409, 'Conflict', { conflictId: 'x' });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    handleErrorResponse(err, req, res as any, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ conflictId: 'x' }));
  });

  it('defaults to 500 for plain Error', () => {
    const err = new Error('unexpected');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    handleErrorResponse(err, req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
