import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentPeriodKeys, getWeeklyPeriodKey, getYearlyPeriodKey } from '../../../src/api/helpers/period';

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
