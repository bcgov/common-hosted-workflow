"use strict";
/**
 * Preprocessing helpers for Express `req.query` and `req.params` before schema validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.flattenQueryParams = flattenQueryParams;
exports.emptyQueryValueToUndefined = emptyQueryValueToUndefined;
exports.asParamRecord = asParamRecord;
/**
 * Normalizes Express `req.query` values to plain strings (first element if repeated).
 * Avoids fields being dropped when the parser yields `string[]`.
 */
function flattenQueryParams(query) {
    if (!query || typeof query !== 'object' || Array.isArray(query))
        return {};
    const out = {};
    for (const [key, raw] of Object.entries(query)) {
        if (raw === undefined || raw === null) {
            out[key] = undefined;
            continue;
        }
        if (Array.isArray(raw)) {
            const first = raw[0];
            if (typeof first === 'string')
                out[key] = first;
            else if (first === undefined || first === null)
                out[key] = undefined;
            else
                out[key] = String(first);
            continue;
        }
        if (typeof raw === 'string') {
            out[key] = raw;
        }
    }
    return out;
}
/** Treats empty string / null / undefined as absent for optional query fields. */
function emptyQueryValueToUndefined(value) {
    if (value === '' || value === undefined || value === null)
        return undefined;
    return value;
}
/**
 * Preprocess for `req.params` before `z.object(...).strict()` — safe object for Zod.
 */
function asParamRecord(params) {
    return params && typeof params === 'object' && !Array.isArray(params) ? params : {};
}
