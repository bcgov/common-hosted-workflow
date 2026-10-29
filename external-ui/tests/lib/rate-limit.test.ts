import { describe, expect, it } from 'vitest';

import {
  formatCompactCount,
  formatCount,
  formatResetDate,
  formatShortDate,
  formatWeeklyPeriodLabel,
  getNextWeeklyReset,
  getNextYearlyReset,
  getRateLimitStatus,
  getUsageBarTone,
  getUsagePercent,
  getUsageRatio,
} from '@/lib/rate-limit';

type UsageFixture = {
  weeklyRateLimit: number | null;
  yearlyRateLimit: number | null;
  weeklyExecutionCount: number;
  yearlyExecutionCount: number;
};

describe('getRateLimitStatus', () => {
  it('reports no limit only when both limits are null', () => {
    const project: UsageFixture = {
      weeklyRateLimit: null,
      yearlyRateLimit: null,
      weeklyExecutionCount: 42,
      yearlyExecutionCount: 500,
    };
    expect(getRateLimitStatus(project)).toBe('no_limit');
  });

  it('treats a single configured limit as a configured project', () => {
    const project: UsageFixture = {
      weeklyRateLimit: 100,
      yearlyRateLimit: null,
      weeklyExecutionCount: 0,
      yearlyExecutionCount: 5_000,
    };
    expect(getRateLimitStatus(project)).toBe('within_limit');
  });

  it('marks usage at exactly the weekly limit as reached', () => {
    const project: UsageFixture = {
      weeklyRateLimit: 12_000,
      yearlyRateLimit: 500_000,
      weeklyExecutionCount: 12_000,
      yearlyExecutionCount: 60_000,
    };
    expect(getRateLimitStatus(project)).toBe('limit_reached');
  });

  it('marks usage at exactly the yearly limit as reached', () => {
    const project: UsageFixture = {
      weeklyRateLimit: 12_000,
      yearlyRateLimit: 500_000,
      weeklyExecutionCount: 100,
      yearlyExecutionCount: 500_000,
    };
    expect(getRateLimitStatus(project)).toBe('limit_reached');
  });

  it('rejects every run when the configured limit is zero', () => {
    const project: UsageFixture = {
      weeklyRateLimit: 0,
      yearlyRateLimit: null,
      weeklyExecutionCount: 0,
      yearlyExecutionCount: 0,
    };
    expect(getRateLimitStatus(project)).toBe('limit_reached');
  });

  it('marks 80% of a set limit as near', () => {
    const project: UsageFixture = {
      weeklyRateLimit: 10_000,
      yearlyRateLimit: null,
      weeklyExecutionCount: 8_000,
      yearlyExecutionCount: 0,
    };
    expect(getRateLimitStatus(project)).toBe('near_limit');
  });

  it('keeps usage just below 80% within the limit', () => {
    const project: UsageFixture = {
      weeklyRateLimit: 10_000,
      yearlyRateLimit: null,
      weeklyExecutionCount: 7_990,
      yearlyExecutionCount: 0,
    };
    expect(getRateLimitStatus(project)).toBe('within_limit');
  });

  it('prefers reached over near across periods', () => {
    const project: UsageFixture = {
      weeklyRateLimit: 10_000,
      yearlyRateLimit: 50_000,
      weeklyExecutionCount: 8_000,
      yearlyExecutionCount: 50_000,
    };
    expect(getRateLimitStatus(project)).toBe('limit_reached');
  });
});

describe('getUsageBarTone', () => {
  it.each([
    [0, 'blue'],
    [0.5, 'blue'],
    [0.749, 'blue'],
    [0.75, 'amber'],
    [0.99, 'amber'],
    [1, 'red'],
    [1.5, 'red'],
  ])('maps a ratio of %d to %s', (ratio, tone) => {
    expect(getUsageBarTone(ratio)).toBe(tone);
  });
});

describe('usage ratio and percentage helpers', () => {
  it('returns a null ratio and percent when there is no usable limit', () => {
    expect(getUsageRatio(50, null)).toBeNull();
    expect(getUsageRatio(50, 0)).toBeNull();
    expect(getUsagePercent(50, null)).toBeNull();
    expect(getUsagePercent(50, 0)).toBeNull();
  });

  it('computes ratio and whole-number percent from usage and limit', () => {
    expect(getUsageRatio(8_640, 12_000)).toBeCloseTo(0.72);
    expect(getUsagePercent(8_640, 12_000)).toBe(72);
    expect(getUsagePercent(2, 3)).toBe(67);
    expect(getUsagePercent(0, 100)).toBe(0);
    expect(getUsagePercent(150, 100)).toBe(150);
  });
});

describe('count formatting', () => {
  it('formats full counts with comma grouping', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(9_999)).toBe('9,999');
    expect(formatCount(1_234_567)).toBe('1,234,567');
  });

  it('compacts large values for stat cards', () => {
    expect(formatCompactCount(9_999)).toBe('9,999');
    expect(formatCompactCount(10_000)).toBe('10K');
    expect(formatCompactCount(286_000)).toBe('286K');
    expect(formatCompactCount(999_999)).toBe('1M');
    expect(formatCompactCount(1_234_567)).toBe('1.2M');
    expect(formatCompactCount(2_000_000)).toBe('2M');
  });
});

describe('reset and period dates', () => {
  // Instants are mid-day UTC so their Vancouver calendar date is unambiguous
  // regardless of the test runner's timezone.
  it('labels the current Mon–Sun week in the Vancouver timezone', () => {
    expect(formatWeeklyPeriodLabel(new Date('2026-10-27T20:00:00Z'))).toBe('Oct 26 to Nov 1');
  });

  it('labels a week that straddles the year boundary', () => {
    expect(formatWeeklyPeriodLabel(new Date('2026-12-30T20:00:00Z'))).toBe('Dec 28 to Jan 3');
  });

  it('resets weekly counters on the next Monday', () => {
    expect(getNextWeeklyReset(new Date('2026-10-27T20:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02');
  });

  it('resets on the following day when today is Sunday', () => {
    expect(getNextWeeklyReset(new Date('2026-11-01T20:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-02');
  });

  it('rolls the weekly reset into January from a late-December Tuesday', () => {
    expect(getNextWeeklyReset(new Date('2026-12-29T20:00:00Z')).toISOString().slice(0, 10)).toBe('2027-01-04');
  });

  it('resets yearly counters on January 1 of the next year', () => {
    expect(getNextYearlyReset(new Date('2026-05-15T20:00:00Z')).toISOString().slice(0, 10)).toBe('2027-01-01');
  });

  it('treats New Year’s Day itself as part of the new year', () => {
    expect(getNextYearlyReset(new Date('2027-01-01T20:00:00Z')).toISOString().slice(0, 10)).toBe('2028-01-01');
  });

  it('formats short and dated labels', () => {
    expect(formatShortDate(new Date('2026-09-02T20:00:00Z'))).toBe('Sep 2');
    expect(formatResetDate(new Date('2027-01-04T12:00:00Z'))).toBe('Jan 4, 2027');
  });
});
