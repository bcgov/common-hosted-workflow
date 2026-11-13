"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const zod_1 = require("zod");
const string_1 = require("../../../src/api/utils/string");
(0, vitest_1.describe)('shortenIdForLog', () => {
    (0, vitest_1.it)('returns "(none)" for undefined', () => {
        (0, vitest_1.expect)((0, string_1.shortenIdForLog)(undefined)).toBe('(none)');
    });
    (0, vitest_1.it)('returns "(none)" for empty string', () => {
        (0, vitest_1.expect)((0, string_1.shortenIdForLog)('')).toBe('(none)');
    });
    (0, vitest_1.it)('returns full string when 8 chars or fewer', () => {
        (0, vitest_1.expect)((0, string_1.shortenIdForLog)('abcd1234')).toBe('abcd1234');
    });
    (0, vitest_1.it)('truncates and appends ellipsis when longer than 8 chars', () => {
        (0, vitest_1.expect)((0, string_1.shortenIdForLog)('abcdefghij')).toBe('abcdefgh...');
    });
    (0, vitest_1.it)('trims whitespace before measuring length', () => {
        (0, vitest_1.expect)((0, string_1.shortenIdForLog)('  short  ')).toBe('short');
    });
});
(0, vitest_1.describe)('isNonEmptyString', () => {
    (0, vitest_1.it)('returns true for a non-empty string', () => {
        (0, vitest_1.expect)((0, string_1.isNonEmptyString)('hello')).toBe(true);
    });
    (0, vitest_1.it)('returns false for an empty string', () => {
        (0, vitest_1.expect)((0, string_1.isNonEmptyString)('')).toBe(false);
    });
    (0, vitest_1.it)('returns false for whitespace-only string', () => {
        (0, vitest_1.expect)((0, string_1.isNonEmptyString)('   ')).toBe(false);
    });
    (0, vitest_1.it)('returns false for non-string values', () => {
        (0, vitest_1.expect)((0, string_1.isNonEmptyString)(42)).toBe(false);
        (0, vitest_1.expect)((0, string_1.isNonEmptyString)(null)).toBe(false);
        (0, vitest_1.expect)((0, string_1.isNonEmptyString)(undefined)).toBe(false);
    });
});
(0, vitest_1.describe)('trimString', () => {
    (0, vitest_1.it)('trims whitespace from a string', () => {
        (0, vitest_1.expect)((0, string_1.trimString)('  hello  ')).toBe('hello');
    });
    (0, vitest_1.it)('returns empty string for non-string values', () => {
        (0, vitest_1.expect)((0, string_1.trimString)(42)).toBe('');
        (0, vitest_1.expect)((0, string_1.trimString)(null)).toBe('');
        (0, vitest_1.expect)((0, string_1.trimString)(undefined)).toBe('');
    });
});
(0, vitest_1.describe)('applyLowercaseToZodEnum', () => {
    const schema = (0, string_1.applyLowercaseToZodEnum)(zod_1.z.enum(['active', 'read']));
    (0, vitest_1.it)('accepts a lowercase value', () => {
        (0, vitest_1.expect)(schema.parse('active')).toBe('active');
    });
    (0, vitest_1.it)('lowercases an uppercase value', () => {
        (0, vitest_1.expect)(schema.parse('ACTIVE')).toBe('active');
    });
    (0, vitest_1.it)('trims and lowercases', () => {
        (0, vitest_1.expect)(schema.parse('  Read  ')).toBe('read');
    });
    (0, vitest_1.it)('rejects an invalid enum value', () => {
        (0, vitest_1.expect)(() => schema.parse('unknown')).toThrow();
    });
});
(0, vitest_1.describe)('applyLowercaseToOptionalZodEnum', () => {
    const schema = (0, string_1.applyLowercaseToOptionalZodEnum)(zod_1.z.enum(['pending', 'completed']));
    (0, vitest_1.it)('passes through undefined', () => {
        (0, vitest_1.expect)(schema.parse(undefined)).toBeUndefined();
    });
    (0, vitest_1.it)('lowercases a valid value', () => {
        (0, vitest_1.expect)(schema.parse('PENDING')).toBe('pending');
    });
    (0, vitest_1.it)('rejects an invalid value', () => {
        (0, vitest_1.expect)(() => schema.parse('invalid')).toThrow();
    });
});
