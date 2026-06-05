/**
 * Formats a paginated list response with a keyset cursor.
 *
 * When the number of returned items equals the requested limit, a `nextCursor`
 * is generated from the last item's `createdAt` and `id` in the format `ISO|uuid`.
 * Otherwise `nextCursor` is null, indicating no more pages.
 */
export function formatListResponse<T extends { createdAt: Date; id: string }>(
  items: T[],
  limit: number,
): { data: T[]; nextCursor: string | null } {
  const last = items.at(-1);
  if (items.length === limit && last) {
    return { data: items, nextCursor: `${last.createdAt.toISOString()}|${last.id}` };
  }
  return { data: items, nextCursor: null };
}
