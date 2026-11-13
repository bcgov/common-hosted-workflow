"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const parse_1 = require("../../../src/api/utils/parse");
(0, vitest_1.describe)('parsePositiveInteger', () => {
    (0, vitest_1.it)('parses a valid positive integer string', () => {
        (0, vitest_1.expect)((0, parse_1.parsePositiveInteger)('42')).toBe(42);
    });
    (0, vitest_1.it)('returns null for undefined', () => {
        (0, vitest_1.expect)((0, parse_1.parsePositiveInteger)(undefined)).toBeNull();
    });
    (0, vitest_1.it)('returns null for empty string', () => {
        (0, vitest_1.expect)((0, parse_1.parsePositiveInteger)('')).toBeNull();
    });
    (0, vitest_1.it)('returns null for non-numeric string', () => {
        (0, vitest_1.expect)((0, parse_1.parsePositiveInteger)('abc')).toBeNull();
    });
    (0, vitest_1.it)('returns null for zero', () => {
        (0, vitest_1.expect)((0, parse_1.parsePositiveInteger)('0')).toBeNull();
    });
    (0, vitest_1.it)('returns null for negative number string', () => {
        (0, vitest_1.expect)((0, parse_1.parsePositiveInteger)('-5')).toBeNull();
    });
    (0, vitest_1.it)('returns null for decimal string', () => {
        (0, vitest_1.expect)((0, parse_1.parsePositiveInteger)('3.14')).toBeNull();
    });
});
(0, vitest_1.describe)('parseDate', () => {
    (0, vitest_1.it)('parses a valid ISO date string', () => {
        const result = (0, parse_1.parseDate)('2025-06-01T12:00:00.000Z');
        (0, vitest_1.expect)(result).toBeInstanceOf(Date);
        (0, vitest_1.expect)(result?.toISOString()).toBe('2025-06-01T12:00:00.000Z');
    });
    (0, vitest_1.it)('returns null for undefined', () => {
        (0, vitest_1.expect)((0, parse_1.parseDate)(undefined)).toBeNull();
    });
    (0, vitest_1.it)('returns null for empty string', () => {
        (0, vitest_1.expect)((0, parse_1.parseDate)('')).toBeNull();
    });
    (0, vitest_1.it)('returns null for invalid date string', () => {
        (0, vitest_1.expect)((0, parse_1.parseDate)('not-a-date')).toBeNull();
    });
});
(0, vitest_1.describe)('parseOptionalBodyTimestamp', () => {
    (0, vitest_1.it)('returns undefined when value is undefined', () => {
        (0, vitest_1.expect)((0, parse_1.parseOptionalBodyTimestamp)(undefined)).toBeUndefined();
    });
    (0, vitest_1.it)('returns null when value is null', () => {
        (0, vitest_1.expect)((0, parse_1.parseOptionalBodyTimestamp)(null)).toBeNull();
    });
    (0, vitest_1.it)('parses a valid ISO string to Date', () => {
        const result = (0, parse_1.parseOptionalBodyTimestamp)('2025-12-31T00:00:00Z');
        (0, vitest_1.expect)(result).toBeInstanceOf(Date);
        (0, vitest_1.expect)(result?.toISOString()).toBe('2025-12-31T00:00:00.000Z');
    });
    (0, vitest_1.it)('returns undefined for an invalid date string', () => {
        (0, vitest_1.expect)((0, parse_1.parseOptionalBodyTimestamp)('not-a-date')).toBeUndefined();
    });
    (0, vitest_1.it)('returns undefined for non-string types', () => {
        (0, vitest_1.expect)((0, parse_1.parseOptionalBodyTimestamp)(12345)).toBeUndefined();
        (0, vitest_1.expect)((0, parse_1.parseOptionalBodyTimestamp)(true)).toBeUndefined();
    });
});
