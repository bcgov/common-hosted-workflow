/**
 * Unit tests for `src/api/routes/helpers/wil-response.ts`.
 */
import { describe, expect, it } from 'vitest';
import { formatListResponse } from '../../../../src/api/routes/helpers/wil-response';

function makeItem(id: string, createdAt: Date = new Date('2025-06-01T12:00:00.000Z')) {
  return { id, createdAt, title: `Item ${id}` };
}

describe('formatListResponse', () => {
  it('returns null nextCursor when items are fewer than limit', () => {
    const items = [makeItem('a'), makeItem('b')];
    const result = formatListResponse(items, 10);

    expect(result.data).toEqual(items);
    expect(result.nextCursor).toBeNull();
  });

  it('returns null nextCursor when items list is empty', () => {
    const result = formatListResponse([], 20);

    expect(result.data).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('returns a cursor when items.length equals limit', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    const result = formatListResponse(items, 3);

    expect(result.nextCursor).not.toBeNull();
  });

  it('cursor format is ISO|id of the last item', () => {
    const lastDate = new Date('2025-06-15T08:30:00.000Z');
    const items = [makeItem('first'), makeItem('last', lastDate)];
    const result = formatListResponse(items, 2);

    expect(result.nextCursor).toBe(`${lastDate.toISOString()}|last`);
  });

  it('preserves all item data in the response', () => {
    const items = [{ id: 'x', createdAt: new Date('2025-01-01T00:00:00.000Z'), extra: 'data' }];
    const result = formatListResponse(items, 5);

    expect(result.data[0]).toEqual(items[0]);
  });

  it('returns null nextCursor when limit is 1 and only 0 items', () => {
    const result = formatListResponse([], 1);

    expect(result.nextCursor).toBeNull();
  });

  it('returns cursor when exactly 1 item matches limit of 1', () => {
    const date = new Date('2025-03-10T14:00:00.000Z');
    const items = [makeItem('only-one', date)];
    const result = formatListResponse(items, 1);

    expect(result.nextCursor).toBe(`${date.toISOString()}|only-one`);
  });
});
