'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.mapActionToUiResponse = mapActionToUiResponse;
exports.formatListResponse = formatListResponse;
/** Reads the cancellation reason stored in the action's metadata, if present. */
function extractCancellationReason(metadata) {
  if (metadata && typeof metadata === 'object') {
    const reason = metadata.cancellationReason;
    if (typeof reason === 'string' && reason.length > 0) return reason;
  }
  return null;
}
/**
 * Maps an action DB row to a UI-safe response shape.
 *
 * Strips sensitive fields (callback URLs, internal IDs, raw metadata) and removes
 * any key whose lowercase form matches `formapikey` from showform payloads. The
 * only metadata surfaced is the human-readable `cancellationReason`.
 */
function mapActionToUiResponse(action) {
  const payload = { ...action.payload };
  if (action.actionType === 'showform') {
    for (const key of Object.keys(payload)) {
      if (key.toLowerCase() === 'formapikey') {
        delete payload[key];
      }
    }
  }
  return {
    id: action.id,
    actionType: action.actionType,
    actionTitle: action.actionTitle ?? null,
    payload,
    actorId: action.actorId,
    actorType: action.actorType,
    status: action.status,
    priority: action.priority,
    dueDate: action.dueDate,
    claimedBy: action.claimedBy,
    claimedAt: action.claimedAt,
    completedBy: action.completedBy,
    completedAt: action.completedAt,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    cancellationReason: extractCancellationReason(action.metadata),
  };
}
/**
 * Formats a paginated list response with a keyset cursor.
 *
 * Expects `items` to have been fetched via the repository's "overfetch by one"
 * pattern (`limit + 1` rows) and trimmed with `paginateOverfetchedRows`, so `hasMore`
 * reflects whether another page actually exists — rather than guessing from
 * `items.length === limit`, which is wrong whenever the result set ends exactly on
 * a page boundary.
 *
 * When `hasMore` is true, `nextCursor` is generated from the last item's `createdAt`
 * and `id` in the format `ISO|uuid`. Otherwise `nextCursor` is null.
 */
function formatListResponse(items, hasMore) {
  const last = items.at(-1);
  if (hasMore && last) {
    return { data: items, nextCursor: `${last.createdAt.toISOString()}|${last.id}` };
  }
  return { data: items, nextCursor: null };
}
