import type { ActionRequest } from '../../../db/schema/workflow-interaction-layer';

export type UiActionResponse = {
  id: string;
  actionType: string;
  actionTitle: string | null;
  payload: Record<string, unknown>;
  actorId: string;
  actorType: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  claimedBy: string | null;
  claimedAt: Date | null;
  completedBy: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Maps an action DB row to a UI-safe response shape.
 *
 * Strips sensitive fields (callback URLs, internal IDs, metadata) and removes
 * any key whose lowercase form matches `formapikey` from showform payloads.
 */
export function mapActionToUiResponse(action: ActionRequest): UiActionResponse {
  const payload = { ...(action.payload as Record<string, unknown>) };

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
export function formatListResponse<T extends { createdAt: Date; id: string }>(
  items: T[],
  hasMore: boolean,
): { data: T[]; nextCursor: string | null } {
  const last = items.at(-1);
  if (hasMore && last) {
    return { data: items, nextCursor: `${last.createdAt.toISOString()}|${last.id}` };
  }
  return { data: items, nextCursor: null };
}
