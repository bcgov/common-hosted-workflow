import { describe, expect, it } from 'vitest';
import { AppError, handleErrorResponse } from '../../../src/api/utils/errors';
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

describe('handleErrorResponse', () => {
  it('sends AppError status and message as JSON', () => {
    const err = new AppError(403, 'Forbidden');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    handleErrorResponse(err, req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'Forbidden',
      }),
    });
  });

  it('includes details from AppError', () => {
    const err = new AppError(409, 'Conflict', { conflictId: 'x' });
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    handleErrorResponse(err, req, res as any, next);

    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'Conflict',
        details: { conflictId: 'x' },
      }),
    });
  });

  it('defaults to 500 for plain Error', () => {
    const err = new Error('unexpected');
    const req = createMockRequest();
    const res = createMockResponse();
    const next = createMockNext();

    handleErrorResponse(err, req, res as any, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        message: 'unexpected',
      }),
    });
  });
});
