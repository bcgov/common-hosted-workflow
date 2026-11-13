"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const list_query_1 = require("../../../src/api/helpers/list-query");
(0, vitest_1.describe)('optionalSinceOrCursorQueryParam', () => {
    (0, vitest_1.it)('parses a plain ISO date as time mode', () => {
        const result = list_query_1.optionalSinceOrCursorQueryParam.parse('2025-06-01T12:00:00.000Z');
        (0, vitest_1.expect)(result.mode).toBe('time');
        if (result.mode === 'time') {
            (0, vitest_1.expect)(result.since).toBeInstanceOf(Date);
            (0, vitest_1.expect)(result.since.toISOString()).toBe('2025-06-01T12:00:00.000Z');
        }
    });
    (0, vitest_1.it)('parses ISO|uuid as cursor mode', () => {
        const cursor = '2025-06-01T12:00:00.000Z|a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d';
        const result = list_query_1.optionalSinceOrCursorQueryParam.parse(cursor);
        (0, vitest_1.expect)(result.mode).toBe('cursor');
        if (result.mode === 'cursor') {
            (0, vitest_1.expect)(result.createdAt).toBeInstanceOf(Date);
            (0, vitest_1.expect)(result.id).toBe('a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d');
        }
    });
    (0, vitest_1.it)('rejects an invalid ISO date', () => {
        (0, vitest_1.expect)(() => list_query_1.optionalSinceOrCursorQueryParam.parse('not-a-date')).toThrow();
    });
    (0, vitest_1.it)('rejects a cursor with invalid timestamp', () => {
        (0, vitest_1.expect)(() => list_query_1.optionalSinceOrCursorQueryParam.parse('bad-date|a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d')).toThrow();
    });
    (0, vitest_1.it)('rejects a cursor with invalid UUID', () => {
        (0, vitest_1.expect)(() => list_query_1.optionalSinceOrCursorQueryParam.parse('2025-06-01T12:00:00.000Z|not-a-uuid')).toThrow();
    });
    (0, vitest_1.it)('rejects an empty string', () => {
        (0, vitest_1.expect)(() => list_query_1.optionalSinceOrCursorQueryParam.parse('')).toThrow();
    });
});
(0, vitest_1.describe)('encodeListNextCursor', () => {
    (0, vitest_1.it)('encodes createdAt and id as ISO|uuid', () => {
        const row = { createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'abc-123' };
        (0, vitest_1.expect)((0, list_query_1.encodeListNextCursor)(row)).toBe('2025-06-01T12:00:00.000Z|abc-123');
    });
});
(0, vitest_1.describe)('nextCursorFromPagedItems', () => {
    (0, vitest_1.it)('returns cursor when hasMore is true', () => {
        const items = [
            { createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'item-1' },
            { createdAt: new Date('2025-06-01T11:00:00.000Z'), id: 'item-2' },
        ];
        const cursor = (0, list_query_1.nextCursorFromPagedItems)(items, true);
        (0, vitest_1.expect)(cursor).toBe('2025-06-01T11:00:00.000Z|item-2');
    });
    (0, vitest_1.it)('returns null when hasMore is false', () => {
        const items = [{ createdAt: new Date('2025-06-01T12:00:00.000Z'), id: 'item-1' }];
        (0, vitest_1.expect)((0, list_query_1.nextCursorFromPagedItems)(items, false)).toBeNull();
    });
    (0, vitest_1.it)('returns null for empty items even when hasMore is true', () => {
        (0, vitest_1.expect)((0, list_query_1.nextCursorFromPagedItems)([], true)).toBeNull();
    });
});
(0, vitest_1.describe)('paginateOverfetchedRows', () => {
    (0, vitest_1.it)('reports hasMore=false and returns all rows when count is within limit', () => {
        const rows = ['a', 'b'];
        const result = (0, list_query_1.paginateOverfetchedRows)(rows, 5);
        (0, vitest_1.expect)(result.hasMore).toBe(false);
        (0, vitest_1.expect)(result.rows).toEqual(['a', 'b']);
    });
    (0, vitest_1.it)('reports hasMore=false when rows.length exactly equals limit (the off-by-one case)', () => {
        // This is the scenario that broke keyset pagination: the DB happened to return exactly
        // `limit` rows because the result set ends there, not because there's another page.
        const rows = ['a', 'b', 'c'];
        const result = (0, list_query_1.paginateOverfetchedRows)(rows, 3);
        (0, vitest_1.expect)(result.hasMore).toBe(false);
        (0, vitest_1.expect)(result.rows).toEqual(['a', 'b', 'c']);
    });
    (0, vitest_1.it)('reports hasMore=true and trims the extra row when rows.length exceeds limit', () => {
        const rows = ['a', 'b', 'c', 'd'];
        const result = (0, list_query_1.paginateOverfetchedRows)(rows, 3);
        (0, vitest_1.expect)(result.hasMore).toBe(true);
        (0, vitest_1.expect)(result.rows).toEqual(['a', 'b', 'c']);
    });
    (0, vitest_1.it)('handles an empty result set', () => {
        const result = (0, list_query_1.paginateOverfetchedRows)([], 10);
        (0, vitest_1.expect)(result.hasMore).toBe(false);
        (0, vitest_1.expect)(result.rows).toEqual([]);
    });
});
(0, vitest_1.describe)('limitQueryString', () => {
    (0, vitest_1.it)('accepts a valid integer within range', () => {
        (0, vitest_1.expect)(list_query_1.limitQueryString.parse('50')).toBe(50);
    });
    (0, vitest_1.it)('accepts boundary value 1', () => {
        (0, vitest_1.expect)(list_query_1.limitQueryString.parse('1')).toBe(1);
    });
    (0, vitest_1.it)('accepts boundary value 200', () => {
        (0, vitest_1.expect)(list_query_1.limitQueryString.parse('200')).toBe(200);
    });
    (0, vitest_1.it)('rejects 0', () => {
        (0, vitest_1.expect)(() => list_query_1.limitQueryString.parse('0')).toThrow();
    });
    (0, vitest_1.it)('rejects values above 200', () => {
        (0, vitest_1.expect)(() => list_query_1.limitQueryString.parse('201')).toThrow();
    });
    (0, vitest_1.it)('rejects non-numeric strings', () => {
        (0, vitest_1.expect)(() => list_query_1.limitQueryString.parse('abc')).toThrow();
    });
    (0, vitest_1.it)('rejects decimal strings', () => {
        (0, vitest_1.expect)(() => list_query_1.limitQueryString.parse('3.5')).toThrow();
    });
});
