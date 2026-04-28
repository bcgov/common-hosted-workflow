import { describe, expect, it } from 'vitest';
import { formatDbErrorForLog, normalizeCreateActionTimestamps } from '../../../src/api/helpers/db-helper';

describe('formatDbErrorForLog', () => {
  it('formats a simple Error message', () => {
    const result = formatDbErrorForLog(new Error('connection refused'));
    expect(result).toContain('connection refused');
  });

  it('includes code, constraint, and detail when present', () => {
    const err = Object.assign(new Error('insert failed'), {
      code: '23505',
      constraint: 'uq_project_id',
      detail: 'Key (project_id)=(abc) already exists.',
    });
    const result = formatDbErrorForLog(err);
    expect(result).toContain('code=23505');
    expect(result).toContain('constraint=uq_project_id');
    expect(result).toContain('detail=Key (project_id)=(abc) already exists.');
  });

  it('walks the cause chain', () => {
    const inner = Object.assign(new Error('driver error'), { code: '22P02' });
    const outer = new Error('drizzle error');
    (outer as any).cause = inner;
    const result = formatDbErrorForLog(outer);
    expect(result).toContain('drizzle error');
    expect(result).toContain('driver error');
    expect(result).toContain('code=22P02');
  });

  it('handles non-Error input gracefully', () => {
    expect(formatDbErrorForLog('string error')).toBe('');
    expect(formatDbErrorForLog(null)).toBe('');
  });
});

describe('normalizeCreateActionTimestamps', () => {
  it('converts valid ISO strings to Date objects', () => {
    const result = normalizeCreateActionTimestamps({
      dueDate: '2025-12-31T00:00:00Z',
      checkIn: '2025-12-15T00:00:00Z',
    });
    expect(result.dueDate).toBeInstanceOf(Date);
    expect(result.checkIn).toBeInstanceOf(Date);
    expect(result.dueDate?.toISOString()).toBe('2025-12-31T00:00:00.000Z');
  });

  it('returns null for undefined values', () => {
    const result = normalizeCreateActionTimestamps({});
    expect(result.dueDate).toBeNull();
    expect(result.checkIn).toBeNull();
  });

  it('returns null for null values', () => {
    const result = normalizeCreateActionTimestamps({ dueDate: null, checkIn: null });
    expect(result.dueDate).toBeNull();
    expect(result.checkIn).toBeNull();
  });

  it('returns null for invalid date strings', () => {
    const result = normalizeCreateActionTimestamps({ dueDate: 'not-a-date', checkIn: 'invalid' });
    expect(result.dueDate).toBeNull();
    expect(result.checkIn).toBeNull();
  });
});
