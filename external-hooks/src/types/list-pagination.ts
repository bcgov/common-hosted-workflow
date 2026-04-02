/**
 * Parsed list `since` query:
 * - `time`: `createdAt >= since` (plain ISO datetime).
 * - `cursor`: keyset continuation; value is `createdAtISO|rowUuid` as in `nextCursor`.
 */
export type ListPaginationSince = { mode: 'time'; since: Date } | { mode: 'cursor'; createdAt: Date; id: string };
