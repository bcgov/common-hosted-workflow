// ---------------------------------------------------------------------------
// Period keys for per-project execution rate limiting.
//
// Weekly keys are ISO-8601 weeks (Monday start) formatted 'YYYY-Www'; yearly
// keys are plain calendar years 'YYYY'. Boundaries are computed in the
// timezone configured via RATE_LIMIT_TIMEZONE so period rollover follows the
// operator's local calendar (default: America/Vancouver), not the server's
// UTC clock. DST is irrelevant to the result because only calendar
// Y/M/D of the instant matter.
// ---------------------------------------------------------------------------

import { RATE_LIMIT_TIMEZONE } from '@config';

const MS_PER_DAY = 86_400_000;
const DEFAULT_TIMEZONE = 'America/Vancouver';

export type PeriodKeys = { weekly: string; yearly: string };

type LocalDate = { year: number; month: number; day: number };
type IsoWeek = { isoYear: number; week: number };

// An operator-provided RATE_LIMIT_TIMEZONE that Intl rejects (typo, retired
// zone name) must not take rate-limit enforcement down with it, so an invalid
// value falls back to the documented default instead of throwing at call time.
// Config already defaults empty values; this validation is purely defensive.
function resolvePeriodTimezone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

// 'en-CA' yields plain numeric Y/M/D parts; formatToParts is walked by part
// type, so the exact literal/segment ordering never matters.
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: resolvePeriodTimezone(RATE_LIMIT_TIMEZONE),
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar year / month / day of `date` as seen in the period timezone (DST-safe via Intl). */
function getLocalDate(date: Date): LocalDate {
  const parts: LocalDate = { year: 0, month: 0, day: 0 };
  for (const part of localDateFormatter.formatToParts(date)) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      parts[part.type] = Number(part.value);
    }
  }
  return parts;
}

/** ISO-8601 weekday (1 = Monday … 7 = Sunday) of a UTC-midnight timestamp. */
function getIsoDayOfWeek(utcMidnight: number): number {
  const day = new Date(utcMidnight).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * ISO-8601 week number and week-based year for a local calendar date, derived
 * with pure date math (no Intl week fields, no day-by-day loops).
 *
 * The Thursday of a date's week decides its ISO week-based year, and Jan 4
 * always falls inside ISO week 1, so the Thursday of the week containing
 * Jan 4 is the first Thursday of that ISO year. The week number is the
 * distance in whole weeks between the two Thursdays.
 */
function getIsoWeek(localDate: LocalDate): IsoWeek {
  const localMidnight = Date.UTC(localDate.year, localDate.month - 1, localDate.day);
  const thursday = localMidnight + (4 - getIsoDayOfWeek(localMidnight)) * MS_PER_DAY;
  const isoYear = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const firstThursday = jan4 + (4 - getIsoDayOfWeek(jan4)) * MS_PER_DAY;
  const week = 1 + (thursday - firstThursday) / (7 * MS_PER_DAY);
  return { isoYear, week };
}

function formatWeeklyKey(isoYear: number, week: number): string {
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Weekly rate-limit period key (`'YYYY-Www'`, ISO-8601 week) of `date` in the period timezone. */
export function getWeeklyPeriodKey(date: Date = new Date()): string {
  const { isoYear, week } = getIsoWeek(getLocalDate(date));
  return formatWeeklyKey(isoYear, week);
}

/** Yearly rate-limit period key (`'YYYY'`, calendar year) of `date` in the period timezone. */
export function getYearlyPeriodKey(date: Date = new Date()): string {
  return `${getLocalDate(date).year}`;
}

/** Weekly and yearly rate-limit period keys of `date`, from a single local-date lookup. */
export function getCurrentPeriodKeys(date: Date = new Date()): PeriodKeys {
  const localDate = getLocalDate(date);
  const { isoYear, week } = getIsoWeek(localDate);
  return { weekly: formatWeeklyKey(isoYear, week), yearly: `${localDate.year}` };
}
