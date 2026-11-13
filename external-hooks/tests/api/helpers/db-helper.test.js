"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const db_helper_1 = require("../../../src/api/helpers/db-helper");
(0, vitest_1.describe)('formatDbErrorForLog', () => {
    (0, vitest_1.it)('formats a simple Error message', () => {
        const result = (0, db_helper_1.formatDbErrorForLog)(new Error('connection refused'));
        (0, vitest_1.expect)(result).toContain('connection refused');
    });
    (0, vitest_1.it)('includes code, constraint, and detail when present', () => {
        const err = Object.assign(new Error('insert failed'), {
            code: '23505',
            constraint: 'uq_project_id',
            detail: 'Key (project_id)=(abc) already exists.',
        });
        const result = (0, db_helper_1.formatDbErrorForLog)(err);
        (0, vitest_1.expect)(result).toContain('code=23505');
        (0, vitest_1.expect)(result).toContain('constraint=uq_project_id');
        (0, vitest_1.expect)(result).toContain('detail=Key (project_id)=(abc) already exists.');
    });
    (0, vitest_1.it)('walks the cause chain', () => {
        const inner = Object.assign(new Error('driver error'), { code: '22P02' });
        const outer = new Error('drizzle error');
        outer.cause = inner;
        const result = (0, db_helper_1.formatDbErrorForLog)(outer);
        (0, vitest_1.expect)(result).toContain('drizzle error');
        (0, vitest_1.expect)(result).toContain('driver error');
        (0, vitest_1.expect)(result).toContain('code=22P02');
    });
    (0, vitest_1.it)('handles non-Error input gracefully', () => {
        (0, vitest_1.expect)((0, db_helper_1.formatDbErrorForLog)('string error')).toBe('');
        (0, vitest_1.expect)((0, db_helper_1.formatDbErrorForLog)(null)).toBe('');
    });
});
(0, vitest_1.describe)('normalizeCreateActionTimestamps', () => {
    (0, vitest_1.it)('converts valid ISO strings to Date objects', () => {
        const result = (0, db_helper_1.normalizeCreateActionTimestamps)({
            dueDate: '2025-12-31T00:00:00Z',
            checkIn: '2025-12-15T00:00:00Z',
        });
        (0, vitest_1.expect)(result.dueDate).toBeInstanceOf(Date);
        (0, vitest_1.expect)(result.checkIn).toBeInstanceOf(Date);
        (0, vitest_1.expect)(result.dueDate?.toISOString()).toBe('2025-12-31T00:00:00.000Z');
    });
    (0, vitest_1.it)('returns null for undefined values', () => {
        const result = (0, db_helper_1.normalizeCreateActionTimestamps)({});
        (0, vitest_1.expect)(result.dueDate).toBeNull();
        (0, vitest_1.expect)(result.checkIn).toBeNull();
    });
    (0, vitest_1.it)('returns null for null values', () => {
        const result = (0, db_helper_1.normalizeCreateActionTimestamps)({ dueDate: null, checkIn: null });
        (0, vitest_1.expect)(result.dueDate).toBeNull();
        (0, vitest_1.expect)(result.checkIn).toBeNull();
    });
    (0, vitest_1.it)('returns null for invalid date strings', () => {
        const result = (0, db_helper_1.normalizeCreateActionTimestamps)({ dueDate: 'not-a-date', checkIn: 'invalid' });
        (0, vitest_1.expect)(result.dueDate).toBeNull();
        (0, vitest_1.expect)(result.checkIn).toBeNull();
    });
});
