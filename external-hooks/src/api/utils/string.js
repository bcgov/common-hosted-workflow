'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.trimString = exports.isNonEmptyString = void 0;
exports.shortenIdForLog = shortenIdForLog;
exports.applyLowercaseToZodEnum = applyLowercaseToZodEnum;
exports.applyLowercaseToOptionalZodEnum = applyLowercaseToOptionalZodEnum;
const zod_1 = require('zod');
/** Returns a shortened ID for logs to avoid leaking full identifiers. */
function shortenIdForLog(id) {
  if (!id) return '(none)';
  const trimmedId = id.trim();
  return trimmedId.length > 8 ? `${trimmedId.slice(0, 8)}...` : trimmedId;
}
/** Returns true when value is a non-empty trimmed string. */
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
exports.isNonEmptyString = isNonEmptyString;
/** Trims a string value; returns empty string for non-strings. */
const trimString = (value) => (typeof value === 'string' ? value.trim() : '');
exports.trimString = trimString;
/**
 * Wraps a Zod enum so JSON string values are trimmed and lowercased before validation
 */
function applyLowercaseToZodEnum(schema) {
  return zod_1.z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), schema);
}
/**
 * Same as `applyLowercaseToZodEnum` for optional fields: `undefined` is passed through unchanged.
 */
function applyLowercaseToOptionalZodEnum(schema) {
  return zod_1.z.preprocess(
    (v) => (v === undefined ? undefined : typeof v === 'string' ? v.trim().toLowerCase() : v),
    schema.optional(),
  );
}
