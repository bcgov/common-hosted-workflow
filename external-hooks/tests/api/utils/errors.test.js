"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const errors_1 = require("../../../src/api/utils/errors");
const mocks_1 = require("../../helpers/mocks");
(0, vitest_1.describe)('AppError', () => {
    (0, vitest_1.it)('stores statusCode and message', () => {
        const err = new errors_1.AppError(404, 'Not found');
        (0, vitest_1.expect)(err.statusCode).toBe(404);
        (0, vitest_1.expect)(err.message).toBe('Not found');
        (0, vitest_1.expect)(err.name).toBe('AppError');
    });
    (0, vitest_1.it)('stores optional details', () => {
        const err = new errors_1.AppError(409, 'Conflict', { conflictId: 'abc' });
        (0, vitest_1.expect)(err.details).toEqual({ conflictId: 'abc' });
    });
    (0, vitest_1.it)('is an instance of Error', () => {
        const err = new errors_1.AppError(500, 'Server error');
        (0, vitest_1.expect)(err).toBeInstanceOf(Error);
    });
});
(0, vitest_1.describe)('handleErrorResponse', () => {
    (0, vitest_1.it)('sends AppError status and message as JSON', () => {
        const err = new errors_1.AppError(403, 'Forbidden');
        const req = (0, mocks_1.createMockRequest)();
        const res = (0, mocks_1.createMockResponse)();
        const next = (0, mocks_1.createMockNext)();
        (0, errors_1.handleErrorResponse)(err, req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(403);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
            error: vitest_1.expect.objectContaining({
                message: 'Forbidden',
            }),
        });
    });
    (0, vitest_1.it)('includes details from AppError', () => {
        const err = new errors_1.AppError(409, 'Conflict', { conflictId: 'x' });
        const req = (0, mocks_1.createMockRequest)();
        const res = (0, mocks_1.createMockResponse)();
        const next = (0, mocks_1.createMockNext)();
        (0, errors_1.handleErrorResponse)(err, req, res, next);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
            error: vitest_1.expect.objectContaining({
                message: 'Conflict',
                details: { conflictId: 'x' },
            }),
        });
    });
    (0, vitest_1.it)('defaults to 500 for plain Error', () => {
        const err = new Error('unexpected');
        const req = (0, mocks_1.createMockRequest)();
        const res = (0, mocks_1.createMockResponse)();
        const next = (0, mocks_1.createMockNext)();
        (0, errors_1.handleErrorResponse)(err, req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(500);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith({
            error: vitest_1.expect.objectContaining({
                message: 'unexpected',
            }),
        });
    });
});
