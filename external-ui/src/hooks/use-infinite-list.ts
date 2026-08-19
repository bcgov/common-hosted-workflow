import { useInfiniteQuery } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

/**
 * Generic response shape for cursor-paginated list endpoints.
 * Matches the `WilListResponse<T>` pattern from our backend.
 */
export type CursorPageResponse<T> = {
  data: T[];
  nextCursor: string | null;
};

type InfiniteListOptions<T> = {
  /** Stable query key (excluding cursor — managed internally). */
  queryKey: QueryKey;
  /** Fetch function that receives cursor (or undefined for first page) and an AbortSignal. */
  queryFn: (params: { cursor: string | undefined; signal: AbortSignal }) => Promise<CursorPageResponse<T>>;
  /** Whether to enable the query (e.g. tenant selected). */
  enabled?: boolean;
};

/**
 * Shared hook for cursor-based infinite/lazy-loading lists.
 *
 * Accumulates items across pages so that "Load More" appends
 * instead of replacing the previous page.
 */
export function useInfiniteList<T>({ queryKey, queryFn, enabled = true }: InfiniteListOptions<T>) {
  const infiniteQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => queryFn({ cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });

  /** Flat list of all items loaded across all pages. */
  const items: T[] = infiniteQuery.data?.pages.flatMap((page) => page.data) ?? [];

  return {
    /** All accumulated items across loaded pages. */
    items,
    /** Whether the initial page is loading. */
    isLoading: infiniteQuery.isLoading,
    /** Whether a subsequent page is being fetched. */
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    /** Whether more pages are available. */
    hasNextPage: infiniteQuery.hasNextPage,
    /** Call to load the next page (appends to existing items). */
    fetchNextPage: infiniteQuery.fetchNextPage,
    /** Error object if the query failed. */
    error: infiniteQuery.error,
  };
}
