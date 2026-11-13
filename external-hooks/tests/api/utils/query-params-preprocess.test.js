"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const query_params_preprocess_1 = require("../../../src/api/utils/query-params-preprocess");
(0, vitest_1.describe)('flattenQueryParams', () => {
    (0, vitest_1.it)('passes through plain string values', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.flattenQueryParams)({ foo: 'bar', baz: 'qux' })).toEqual({ foo: 'bar', baz: 'qux' });
    });
    (0, vitest_1.it)('takes the first element of an array value', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.flattenQueryParams)({ tags: ['a', 'b'] })).toEqual({ tags: 'a' });
    });
    (0, vitest_1.it)('converts undefined/null values to undefined', () => {
        const result = (0, query_params_preprocess_1.flattenQueryParams)({ a: undefined, b: null });
        (0, vitest_1.expect)(result.a).toBeUndefined();
        (0, vitest_1.expect)(result.b).toBeUndefined();
    });
    (0, vitest_1.it)('handles array with undefined first element', () => {
        const result = (0, query_params_preprocess_1.flattenQueryParams)({ x: [undefined] });
        (0, vitest_1.expect)(result.x).toBeUndefined();
    });
    (0, vitest_1.it)('handles array with null first element', () => {
        const result = (0, query_params_preprocess_1.flattenQueryParams)({ x: [null] });
        (0, vitest_1.expect)(result.x).toBeUndefined();
    });
    (0, vitest_1.it)('stringifies non-string array elements', () => {
        const result = (0, query_params_preprocess_1.flattenQueryParams)({ x: [42] });
        (0, vitest_1.expect)(result.x).toBe('42');
    });
    (0, vitest_1.it)('returns empty object for null input', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.flattenQueryParams)(null)).toEqual({});
    });
    (0, vitest_1.it)('returns empty object for undefined input', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.flattenQueryParams)(undefined)).toEqual({});
    });
    (0, vitest_1.it)('returns empty object for array input', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.flattenQueryParams)(['a', 'b'])).toEqual({});
    });
    (0, vitest_1.it)('returns empty object for non-object input', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.flattenQueryParams)('string')).toEqual({});
    });
});
(0, vitest_1.describe)('emptyQueryValueToUndefined', () => {
    (0, vitest_1.it)('returns undefined for empty string', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.emptyQueryValueToUndefined)('')).toBeUndefined();
    });
    (0, vitest_1.it)('returns undefined for undefined', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.emptyQueryValueToUndefined)(undefined)).toBeUndefined();
    });
    (0, vitest_1.it)('returns undefined for null', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.emptyQueryValueToUndefined)(null)).toBeUndefined();
    });
    (0, vitest_1.it)('passes through non-empty values', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.emptyQueryValueToUndefined)('hello')).toBe('hello');
        (0, vitest_1.expect)((0, query_params_preprocess_1.emptyQueryValueToUndefined)(42)).toBe(42);
    });
});
(0, vitest_1.describe)('asParamRecord', () => {
    (0, vitest_1.it)('returns the object as-is when valid', () => {
        const params = { id: '123', name: 'test' };
        (0, vitest_1.expect)((0, query_params_preprocess_1.asParamRecord)(params)).toEqual(params);
    });
    (0, vitest_1.it)('returns empty object for null', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.asParamRecord)(null)).toEqual({});
    });
    (0, vitest_1.it)('returns empty object for undefined', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.asParamRecord)(undefined)).toEqual({});
    });
    (0, vitest_1.it)('returns empty object for array', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.asParamRecord)(['a'])).toEqual({});
    });
    (0, vitest_1.it)('returns empty object for primitive', () => {
        (0, vitest_1.expect)((0, query_params_preprocess_1.asParamRecord)('string')).toEqual({});
    });
});
