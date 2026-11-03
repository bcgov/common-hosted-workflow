import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  describeWeeklyPeriodKey,
  formatPeriodDateLong,
  getCurrentPeriodKeys,
  getNextWeeklyReset,
  getNextYearlyReset,
  getWeeklyPeriodKey,
  getYearlyPeriodKey,
  listWeeklyPeriodKeysOverlappingYearlyPeriod,
} from '../../../src/api/helpers/period';

// RATE_LIMIT_TIMEZONE is unset in tests, so the helper runs with the
// documented default timezone: America/Vancouver (PST = UTC-8, PDT = UTC-7).

describe('getWeeklyPeriodKey', () => {
  it('formats a mid-year Monday with a zero-padded ISO week number', () => {
    expect(getWeeklyPeriodKey(new Date('2026-10-26T12:00:00Z'))).toBe('2026-W44');
  });

  it('formats a mid-year Wednesday in the same ISO week', () => {
    expect(getWeeklyPeriodKey(new Date('2026-06-10T12:00:00Z'))).toBe('2026-W24');
  });

  it('maps late-December dates to week 1 of the next ISO year', () => {
    // Monday 2024-12-30 is already week 1 of ISO year 2025.
    expect(getWeeklyPeriodKey(new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01');
    // Monday 2025-12-29 is already week 1 of ISO year 2026.
    expect(getWeeklyPeriodKey(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01');
  });

  it('keeps early-January dates in the final week of the prior ISO year', () => {
    // Friday 2027-01-01 and Sunday 2027-01-03 belong to 2026-W53.
    expect(getWeeklyPeriodKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(getWeeklyPeriodKey(new Date('2027-01-03T12:00:00Z'))).toBe('2026-W53');
  });

  it('supports ISO years with 53 weeks', () => {
    // ISO year 2026 has 53 weeks (Jan 1 and Dec 31 are both Thursdays);
    // the week of 2026-12-28 is W53, not W52 or 2027-W01.
    expect(getWeeklyPeriodKey(new Date('2026-12-27T12:00:00Z'))).toBe('2026-W52');
    expect(getWeeklyPeriodKey(new Date('2026-12-28T12:00:00Z'))).toBe('2026-W53');
    expect(getWeeklyPeriodKey(new Date('2026-12-31T12:00:00Z'))).toBe('2026-W53');
  });

  it('starts a new ISO week at Vancouver Monday, not UTC Monday', () => {
    // 01:00 UTC Monday is still Sunday 18:00 PDT in Vancouver → previous week.
    expect(getWeeklyPeriodKey(new Date('2026-10-26T01:00:00Z'))).toBe('2026-W43');
    // 09:00 UTC Monday is Monday 02:00 PDT in Vancouver → new week.
    expect(getWeeklyPeriodKey(new Date('2026-10-26T09:00:00Z'))).toBe('2026-W44');
  });

  it('is stable across Vancouver DST transition days', () => {
    // Spring forward 2026-03-08: 02:00 PST jumps to 03:00 PDT (10:00 UTC).
    expect(getWeeklyPeriodKey(new Date('2026-03-08T09:00:00Z'))).toBe('2026-W10');
    expect(getWeeklyPeriodKey(new Date('2026-03-08T10:00:00Z'))).toBe('2026-W10');
    // Fall back 2026-11-01: 02:00 PDT returns to 01:00 PST (09:00 UTC).
    expect(getWeeklyPeriodKey(new Date('2026-11-01T08:00:00Z'))).toBe('2026-W44');
    expect(getWeeklyPeriodKey(new Date('2026-11-01T10:00:00Z'))).toBe('2026-W44');
  });
});

describe('getYearlyPeriodKey', () => {
  it('formats the calendar year of the instant in Vancouver', () => {
    expect(getYearlyPeriodKey(new Date('2026-10-26T12:00:00Z'))).toBe('2026');
  });

  it('keeps the prior year while it is still that day in Vancouver', () => {
    // 23:30 UTC on Dec 31 is mid-afternoon Dec 31 in Vancouver.
    expect(getYearlyPeriodKey(new Date('2026-12-31T23:30:00Z'))).toBe('2026');
    // Already Jan 1 in UTC, but still Dec 31 20:00 PST in Vancouver.
    expect(getYearlyPeriodKey(new Date('2027-01-01T04:00:00Z'))).toBe('2026');
  });

  it('rolls over at Vancouver midnight, not UTC midnight', () => {
    // 00:15 PST on Jan 1 in Vancouver.
    expect(getYearlyPeriodKey(new Date('2027-01-01T08:15:00Z'))).toBe('2027');
  });
});

describe('getCurrentPeriodKeys', () => {
  it('returns weekly and yearly keys for the same instant', () => {
    expect(getCurrentPeriodKeys(new Date('2026-10-26T12:00:00Z'))).toEqual({
      weekly: '2026-W44',
      yearly: '2026',
    });
  });

  it('may disagree across years at ISO year boundaries', () => {
    // Friday 2027-01-01 is ISO week 2026-W53 but calendar year 2027.
    expect(getCurrentPeriodKeys(new Date('2027-01-01T12:00:00Z'))).toEqual({
      weekly: '2026-W53',
      yearly: '2027',
    });
  });
});

describe('listWeeklyPeriodKeysOverlappingYearlyPeriod', () => {
  it('covers every ISO week of the year for a year that needs no straddling neighbours', () => {
    const keys = listWeeklyPeriodKeysOverlappingYearlyPeriod('2026');
    // 2026 spans ISO weeks 2026-W01 (Mon Dec 29, 2025) through 2026-W53.
    expect(keys[0]).toBe('2026-W01');
    expect(keys[keys.length - 1]).toBe('2026-W53');
    expect(keys).toHaveLength(53);
    expect(keys.some((key) => key.startsWith('2025-'))).toBe(false);
  });

  it('includes the straddling previous-year week when Jan 1 falls inside it', () => {
    // Fri Jan 1, 2027 belongs to ISO week 2026-W53 (Mon Dec 28, 2026 – Sun Jan 3, 2027).
    const keys = listWeeklyPeriodKeysOverlappingYearlyPeriod('2027');
    expect(keys[0]).toBe('2026-W53');
    expect(keys).toContain('2027-W01');
  });

  it('contains the weekly key of every day of the year (noon-UTC samples share the Vancouver date)', () => {
    const keys = listWeeklyPeriodKeysOverlappingYearlyPeriod('2026');
    const set = new Set(keys);
    for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
      expect(set.has(getWeeklyPeriodKey(new Date(`${day}T12:00:00Z`)))).toBe(true);
    }
  });

  it('returns the memoized array for repeated calls', () => {
    expect(listWeeklyPeriodKeysOverlappingYearlyPeriod('2026')).toBe(
      listWeeklyPeriodKeysOverlappingYearlyPeriod('2026'),
    );
  });

  it('returns an empty list for a malformed yearly key', () => {
    expect(listWeeklyPeriodKeysOverlappingYearlyPeriod('20X6')).toEqual([]);
    expect(listWeeklyPeriodKeysOverlappingYearlyPeriod('')).toEqual([]);
  });
});

describe('period keys default to the current time', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('compute keys from the system clock when no date is passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));

    expect(getWeeklyPeriodKey()).toBe('2026-W44');
    expect(getYearlyPeriodKey()).toBe('2026');
    expect(getCurrentPeriodKeys()).toEqual({ weekly: '2026-W44', yearly: '2026' });
  });
});

describe('RATE_LIMIT_TIMEZONE handling', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('honours a valid configured timezone', async () => {
    vi.stubEnv('RATE_LIMIT_TIMEZONE', 'UTC');

    vi.resetModules();
    const { getYearlyPeriodKey: getYearlyPeriodKeyInUtc } = await import('../../../src/api/helpers/period');

    // 04:00 UTC on Jan 1 is Jan 1 in UTC, unlike Vancouver (still Dec 31).
    expect(getYearlyPeriodKeyInUtc(new Date('2027-01-01T04:00:00Z'))).toBe('2027');
  });

  it('falls back to America/Vancouver when the configured timezone is invalid', async () => {
    vi.stubEnv('RATE_LIMIT_TIMEZONE', 'Not/AZone');

    vi.resetModules();
    const { getCurrentPeriodKeys: getCurrentPeriodKeysWithBadTz } = await import('../../../src/api/helpers/period');

    // Invalid zone must not throw; keys keep default Vancouver semantics
    // (still Dec 31 there), not UTC semantics.
    expect(getCurrentPeriodKeysWithBadTz(new Date('2027-01-01T04:00:00Z'))).toEqual({
      weekly: '2026-W53',
      yearly: '2026',
    });
  });
});

describe('getNextWeeklyReset', () => {
  it('returns the Monday after the current Mon–Sun week', () => {
    // Wednesday Nov 4, 2026 → reset Monday Nov 9 (noon-UTC anchored).
    expect(formatPeriodDateLong(getNextWeeklyReset(new Date('2026-11-04T20:00:00Z')))).toBe('Monday, November 9, 2026');
  });

  it('returns the next day when the run happens on a Sunday', () => {
    // Sunday Nov 1, 2026 (PDT) → reset Monday Nov 2.
    expect(formatPeriodDateLong(getNextWeeklyReset(new Date('2026-11-01T20:00:00Z')))).toBe('Monday, November 2, 2026');
  });
});

describe('getNextYearlyReset', () => {
  it('returns January 1 of the next Vancouver calendar year', () => {
    expect(formatPeriodDateLong(getNextYearlyReset(new Date('2026-11-04T20:00:00Z')))).toBe('Friday, January 1, 2027');
  });

  it('already targets the next year for runs on late-December Vancouver dates', () => {
    // Dec 31, 2026 16:00 UTC is still Dec 31 in Vancouver → reset Jan 1, 2027.
    expect(formatPeriodDateLong(getNextYearlyReset(new Date('2026-12-31T16:00:00Z')))).toBe('Friday, January 1, 2027');
  });
});

describe('describeWeeklyPeriodKey', () => {
  it('formats a mid-month week with the month dropped from the end date', () => {
    // 2026-W45 starts Monday Nov 2, 2026.
    expect(describeWeeklyPeriodKey('2026-W45')).toBe('Nov 2 to 8, 2026');
  });

  it('keeps both months when the week straddles a month boundary', () => {
    // 2026-W44 starts Monday Oct 26, 2026 and ends Sunday Nov 1.
    expect(describeWeeklyPeriodKey('2026-W44')).toBe('Oct 26 to Nov 1, 2026');
  });

  it('formats the ISO year-boundary week with the correct year', () => {
    // 2026-W01 starts Monday Dec 29, 2025.
    expect(describeWeeklyPeriodKey('2026-W01')).toBe('Dec 29 to Jan 4, 2026');
  });

  it('returns null for keys that cannot exist, so callers can fall back to the raw key', () => {
    expect(describeWeeklyPeriodKey('2026-W53')).toBe('Dec 28 to Jan 3, 2027'); // real 53rd week
    expect(describeWeeklyPeriodKey('2027-W53')).toBeNull(); // ISO 2027 has 52 weeks
    expect(describeWeeklyPeriodKey('2026-W00')).toBeNull();
    expect(describeWeeklyPeriodKey('2026')).toBeNull();
    expect(describeWeeklyPeriodKey('not-a-key')).toBeNull();
  });
});
