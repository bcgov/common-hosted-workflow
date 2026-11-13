'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildPatchSetValues = buildPatchSetValues;
/**
 * Builds a setValues object for action PATCH requests.
 * Only includes fields that were explicitly provided in the request body.
 *
 * Shared by /v1/actions/:actionId and /v1/actors/:actorId/actions/:actionId PATCH handlers.
 */
function buildPatchSetValues(body) {
  const setValues = { updatedAt: new Date() };
  if (body.status !== undefined) setValues.status = body.status;
  if (body.claimedBy !== undefined) setValues.claimedBy = body.claimedBy;
  if (body.claimedAt !== undefined) setValues.claimedAt = body.claimedAt ? new Date(body.claimedAt) : null;
  if (body.completedBy !== undefined) setValues.completedBy = body.completedBy;
  if (body.completedAt !== undefined) setValues.completedAt = body.completedAt ? new Date(body.completedAt) : null;
  return setValues;
}
