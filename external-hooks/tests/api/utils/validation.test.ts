import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createRequestSchemaValidator,
  parseValidatedRequest,
  parseValidatedResponse,
} from '../../../src/api/utils/validation';
import { AppError } from '../../../src/api/utils/errors';
import { createMockRequest, createMockResponse, createMockNext } from '../../helpers/mocks';

const testSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({}).optional(),
  body: z.object({ name: z.string().min(1) }),
});

describe('createRequestSchemaValidator', () => {
  it('calls next() on valid request', () => {
    const middleware = createRequestSchemaValidator(testSchema);
    const req = createMockRequest({ params: { id: '123' }, body: { name: 'test' } });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with AppError 400 on validation failure', () => {
    const middleware = createRequestSchemaValidator(testSchema);
    const req = createMockRequest({ params: { id: '' }, body: { name: '' } });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0][0] as AppError;
    expect(error.statusCode).toBe(400);
  });
});

describe('parseValidatedRequest', () => {
  it('returns parsed data for valid request', () => {
    const req = createMockRequest({ params: { id: '123' }, body: { name: 'test' } });
    const result = parseValidatedRequest(testSchema, req);
    expect(result.params.id).toBe('123');
    expect(result.body.name).toBe('test');
  });

  it('throws on invalid request', () => {
    const req = createMockRequest({ params: {}, body: {} });
    expect(() => parseValidatedRequest(testSchema, req)).toThrow();
  });
});

describe('parseValidatedResponse', () => {
  const responseSchema = z.object({ id: z.string(), count: z.number() });

  it('returns parsed payload on valid data', () => {
    const result = parseValidatedResponse(responseSchema, { id: 'abc', count: 5 });
    expect(result).toEqual({ id: 'abc', count: 5 });
  });

  it('throws AppError 500 on contract drift', () => {
    expect(() => parseValidatedResponse(responseSchema, { id: 'abc' })).toThrow(AppError);
    try {
      parseValidatedResponse(responseSchema, { id: 'abc' });
    } catch (err) {
      expect((err as AppError).statusCode).toBe(500);
      expect((err as AppError).message).toContain('Response validation failed');
    }
  });
});
