import type { ListPaginationSince } from '../../../types/list-pagination';

export function parseSinceParam(since: string | undefined): ListPaginationSince | undefined {
  if (!since) return undefined;
  const pipeIndex = since.indexOf('|');
  if (pipeIndex === -1) {
    const date = new Date(since);
    if (Number.isNaN(date.getTime())) return undefined;
    return { mode: 'time', since: date };
  }
  const isoStr = since.substring(0, pipeIndex);
  const id = since.substring(pipeIndex + 1);
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime()) || !id) return undefined;
  return { mode: 'cursor', createdAt: date, id };
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;

export function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
