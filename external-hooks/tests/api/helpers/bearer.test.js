"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const bearer_1 = require("../../../src/api/helpers/bearer");
(0, vitest_1.describe)('extractBearerToken', () => {
    (0, vitest_1.it)('extracts token from valid Bearer header', () => {
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)('Bearer my-token-123')).toBe('my-token-123');
    });
    (0, vitest_1.it)('is case-insensitive for the Bearer prefix', () => {
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)('bearer my-token')).toBe('my-token');
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)('BEARER my-token')).toBe('my-token');
    });
    (0, vitest_1.it)('trims whitespace from the token', () => {
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)('Bearer   spaced-token  ')).toBe('spaced-token');
    });
    (0, vitest_1.it)('returns null for undefined header', () => {
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)(undefined)).toBeNull();
    });
    (0, vitest_1.it)('returns null for empty string', () => {
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)('')).toBeNull();
    });
    (0, vitest_1.it)('returns null for header without Bearer prefix', () => {
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)('Basic abc123')).toBeNull();
    });
    (0, vitest_1.it)('returns null for "Bearer" with no token', () => {
        (0, vitest_1.expect)((0, bearer_1.extractBearerToken)('Bearer')).toBeNull();
    });
});
