"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const zod_1 = require("zod");
const validation_1 = require("../../../src/api/utils/validation");
const errors_1 = require("../../../src/api/utils/errors");
const mocks_1 = require("../../helpers/mocks");
const testSchema = zod_1.z.object({
    params: zod_1.z.object({ id: zod_1.z.string().min(1) }),
    query: zod_1.z.object({}).optional(),
    body: zod_1.z.object({ name: zod_1.z.string().min(1) }),
});
(0, vitest_1.describe)('createRequestSchemaValidator', () => {
    (0, vitest_1.it)('calls next() on valid request', () => {
        const middleware = (0, validation_1.createRequestSchemaValidator)(testSchema);
        const req = (0, mocks_1.createMockRequest)({ params: { id: '123' }, body: { name: 'test' } });
        const res = (0, mocks_1.createMockResponse)();
        const next = (0, mocks_1.createMockNext)();
        middleware(req, res, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledWith();
    });
    (0, vitest_1.it)('calls next with AppError 400 on validation failure', () => {
        const middleware = (0, validation_1.createRequestSchemaValidator)(testSchema);
        const req = (0, mocks_1.createMockRequest)({ params: { id: '' }, body: { name: '' } });
        const res = (0, mocks_1.createMockResponse)();
        const next = (0, mocks_1.createMockNext)();
        middleware(req, res, next);
        (0, vitest_1.expect)(next).toHaveBeenCalledWith(vitest_1.expect.any(errors_1.AppError));
        const error = next.mock.calls[0][0];
        (0, vitest_1.expect)(error.statusCode).toBe(400);
    });
});
(0, vitest_1.describe)('parseValidatedRequest', () => {
    (0, vitest_1.it)('returns parsed data for valid request', () => {
        const req = (0, mocks_1.createMockRequest)({ params: { id: '123' }, body: { name: 'test' } });
        const result = (0, validation_1.parseValidatedRequest)(testSchema, req);
        (0, vitest_1.expect)(result.params.id).toBe('123');
        (0, vitest_1.expect)(result.body.name).toBe('test');
    });
    (0, vitest_1.it)('throws on invalid request', () => {
        const req = (0, mocks_1.createMockRequest)({ params: {}, body: {} });
        (0, vitest_1.expect)(() => (0, validation_1.parseValidatedRequest)(testSchema, req)).toThrow();
    });
});
(0, vitest_1.describe)('parseValidatedResponse', () => {
    const responseSchema = zod_1.z.object({ id: zod_1.z.string(), count: zod_1.z.number() });
    (0, vitest_1.it)('returns parsed payload on valid data', () => {
        const result = (0, validation_1.parseValidatedResponse)(responseSchema, { id: 'abc', count: 5 });
        (0, vitest_1.expect)(result).toEqual({ id: 'abc', count: 5 });
    });
    (0, vitest_1.it)('throws AppError 500 on contract drift', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseValidatedResponse)(responseSchema, { id: 'abc' })).toThrow(errors_1.AppError);
        try {
            (0, validation_1.parseValidatedResponse)(responseSchema, { id: 'abc' });
        }
        catch (err) {
            (0, vitest_1.expect)(err.statusCode).toBe(500);
            (0, vitest_1.expect)(err.message).toContain('Response validation failed');
        }
    });
});
