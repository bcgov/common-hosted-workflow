import { and, desc, eq, gte, lt, or } from 'drizzle-orm';
import type { ListPaginationSince } from '../../types/list-pagination';

/**
 * Builds Drizzle WHERE clauses for time-based or cursor-based pagination.
 * Intended to be called from the service layer; repositories accept the
 * resulting clauses directly.
 */
export function buildPaginationClauses(
  table: { createdAt: any; id: any },
  paginationSince?: ListPaginationSince,
): any[] {
  if (!paginationSince) return [];

  if (paginationSince.mode === 'time') {
    return [gte(table.createdAt, paginationSince.since)];
  }

  return [
    or(
      lt(table.createdAt, paginationSince.createdAt),
      and(eq(table.createdAt, paginationSince.createdAt), lt(table.id, paginationSince.id)),
    ),
  ];
}
