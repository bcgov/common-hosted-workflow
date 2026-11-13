"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const readonly_1 = require("../../../src/api/constants/readonly");
const readonly_maintenance_1 = require("../../../src/api/middlewares/readonly-maintenance");
const errors_1 = require("../../../src/api/utils/errors");
const mocks_1 = require("../../helpers/mocks");
function run(isReadOnly, method, path = '/anything') {
    const middleware = (0, readonly_maintenance_1.createReadOnlyMiddleware)(isReadOnly);
    const req = (0, mocks_1.createMockRequest)({ method, path });
    const res = (0, mocks_1.createMockResponse)();
    res.setHeader = vitest_1.vi.fn();
    const next = (0, mocks_1.createMockNext)();
    middleware(req, res, next);
    return { res, next };
}
(0, vitest_1.describe)('read-only maintenance middleware', () => {
    (0, vitest_1.describe)('on Gold', () => {
        vitest_1.it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])('lets %s through', (method) => {
            const { res, next } = run(false, method);
            (0, vitest_1.expect)(next).toHaveBeenCalledWith();
            (0, vitest_1.expect)(res.setHeader).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('in read-only mode', () => {
        vitest_1.it.each(['GET', 'HEAD', 'OPTIONS'])('lets %s through so reads keep working', (method) => {
            const { res, next } = run(true, method);
            (0, vitest_1.expect)(next).toHaveBeenCalledWith();
            (0, vitest_1.expect)(res.setHeader).not.toHaveBeenCalled();
        });
        vitest_1.it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('answers %s with a 503 maintenance error', (method) => {
            const { res, next } = run(true, method);
            (0, vitest_1.expect)(next).toHaveBeenCalledTimes(1);
            const error = next.mock.calls[0][0];
            (0, vitest_1.expect)(error).toBeInstanceOf(errors_1.AppError);
            (0, vitest_1.expect)(error.statusCode).toBe(503);
            (0, vitest_1.expect)(error.message).toBe(readonly_1.READONLY_WRITE_MESSAGE);
            (0, vitest_1.expect)(error.details).toEqual({ code: readonly_1.READONLY_MAINTENANCE_CODE });
            (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('Retry-After', vitest_1.expect.any(String));
        });
        (0, vitest_1.it)('lets the read-only CHEFS token POST through so forms still display', () => {
            const { next } = run(true, 'POST', '/triggers/trigger-1/chefs-token');
            (0, vitest_1.expect)(next).toHaveBeenCalledWith();
        });
        (0, vitest_1.it)('does not exempt other POSTs that merely contain chefs-token in the path', () => {
            const { next } = run(true, 'POST', '/chefs-token/extra');
            (0, vitest_1.expect)(next.mock.calls[0][0].statusCode).toBe(503);
        });
        vitest_1.it.each([
            ['POST', '/multi-webhook-wait/register'],
            ['POST', '/multi-webhook-wait/callback/exec-1'],
            ['DELETE', '/multi-webhook-wait/cleanup/exec-1'],
            ['POST', '/chefs/submissions/register'],
            ['POST', '/chefs/waste-management'],
        ])('lets %s %s through because running workflows call it', (method, path) => {
            const { res, next } = run(true, method, path);
            (0, vitest_1.expect)(next).toHaveBeenCalledWith();
            (0, vitest_1.expect)(res.setHeader).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)('still blocks other CHEFS submission writes', () => {
            const { next } = run(true, 'POST', '/chefs/submissions');
            (0, vitest_1.expect)(next.mock.calls[0][0].statusCode).toBe(503);
        });
    });
});
