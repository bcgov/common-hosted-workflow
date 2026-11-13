"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDate = exports.parsePositiveInteger = void 0;
exports.parseOptionalBodyTimestamp = parseOptionalBodyTimestamp;
/** Plain string → positive integer or null (query/path parsing). */
const parsePositiveInteger = (value) => {
    if (!value)
        return null;
    if (!/^\d+$/.test(value))
        return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return null;
    return parsed;
};
exports.parsePositiveInteger = parsePositiveInteger;
/** Plain string → Date or null. */
const parseDate = (value) => {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
};
exports.parseDate = parseDate;
/**
 * JSON body timestamp fields: `undefined` / `null` preserved; strings must parse to a valid Date.
 * Returns `undefined` for invalid non-null values (caller validates).
 */
function parseOptionalBodyTimestamp(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (typeof value !== 'string')
        return undefined;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
