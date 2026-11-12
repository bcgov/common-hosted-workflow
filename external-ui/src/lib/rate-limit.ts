import type { ProjectItem } from '../services/backend/projects';
import { PROJECT_ROLE_ADMIN, PROJECT_ROLE_EDITOR, PROJECT_ROLE_PERSONAL_OWNER } from './roles';

export type RateLimitStatus = 'within_limit' | 'limit_reached' | 'near_limit' | 'no_limit';

export type UsageBarTone = 'blue' | 'amber' | 'red';

export type UsagePeriod = 'weekly' | 'yearly';

/** The usage/limit fields needed to reason about a project's rate-limit state. */
export type RateLimitUsage = Pick<
  ProjectItem,
  | 'weeklyRateLimit'
  | 'yearlyRateLimit'
  | 'weeklyExecutionCount'
  | 'yearlyExecutionCount'
  | 'weeklyTopupRuns'
  | 'yearlyTopupRuns'
>;

/** Share of a limit at which the usage bar turns amber. */
const AMBER_BAR_THRESHOLD = 3 / 4;

/**
 * Threshold check without floating-point drift: true when count/limit >= num/den,
 * computed with integer multiplication (e.g. 80% is 4/5).
 */
function meetsThreshold(count: number, limit: number, num: number, den: number): boolean {
  return count * den >= limit * num;
}

/**
 * The weekly limit actually enforced: the configured base limit plus the
 * top-up runs added for the current week. Null when no weekly limit is
 * configured — top-ups never apply without one.
 */
export function getEffectiveWeeklyLimit(project: RateLimitUsage): number | null {
  if (project.weeklyRateLimit === null) {
    return null;
  }
  return project.weeklyRateLimit + (project.weeklyTopupRuns ?? 0);
}

/**
 * The yearly limit actually enforced: the configured base limit plus the sums
 * of the weekly top-ups whose weeks overlap the current calendar year. Null
 * when no yearly limit is configured.
 */
export function getEffectiveYearlyLimit(project: RateLimitUsage): number | null {
  if (project.yearlyRateLimit === null) {
    return null;
  }
  return project.yearlyRateLimit + (project.yearlyTopupRuns ?? 0);
}

/**
 * Client-side status model:
 * - no_limit: neither weekly nor yearly limit is set
 * - limit_reached: usage is at or above a set limit on either period
 * - near_limit: not reached, but at or above 80% of any set limit
 * - within_limit: everything else
 *
 * Weekly comparisons use the effective weekly limit (base + top-ups).
 */
export function getRateLimitStatus(project: RateLimitUsage): RateLimitStatus {
  const weekly = getEffectiveWeeklyLimit(project);
  const yearly = getEffectiveYearlyLimit(project);

  if (weekly === null && yearly === null) {
    return 'no_limit';
  }

  const reached =
    (weekly !== null && project.weeklyExecutionCount >= weekly) ||
    (yearly !== null && project.yearlyExecutionCount >= yearly);
  if (reached) {
    return 'limit_reached';
  }

  const near =
    (weekly !== null && meetsThreshold(project.weeklyExecutionCount, weekly, 4, 5)) ||
    (yearly !== null && meetsThreshold(project.yearlyExecutionCount, yearly, 4, 5));
  if (near) {
    return 'near_limit';
  }

  return 'within_limit';
}

/** Bar tone for a usage/limit ratio: red at ≥ 100%, amber at ≥ 75%, blue below. */
export function getUsageBarTone(ratio: number): UsageBarTone {
  if (ratio >= 1) {
    return 'red';
  }
  if (ratio >= AMBER_BAR_THRESHOLD) {
    return 'amber';
  }
  return 'blue';
}

/** used/limit as a fraction, or null when the period has no meaningful ratio (no limit, or a zero limit). */
export function getUsageRatio(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) {
    return null;
  }
  return used / limit;
}

/** Usage as a whole percentage of the limit, or null when there is no meaningful ratio. */
export function getUsagePercent(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) {
    return null;
  }
  return Math.round((used / limit) * 100);
}

/** The period whose limit is closest to being reached (null when no limits are set). */
export function getHighestUsagePeriod(project: RateLimitUsage): UsagePeriod | null {
  const weeklyRatio = getUsageRatio(project.weeklyExecutionCount, getEffectiveWeeklyLimit(project));
  const yearlyRatio = getUsageRatio(project.yearlyExecutionCount, getEffectiveYearlyLimit(project));

  if (weeklyRatio === null && yearlyRatio === null) {
    return null;
  }
  if (yearlyRatio === null) {
    return 'weekly';
  }
  if (weeklyRatio === null) {
    return 'yearly';
  }
  return weeklyRatio >= yearlyRatio ? 'weekly' : 'yearly';
}

/**
 * True when the viewer may see the "Request more runs" action: a project
 * admin or editor, or a personal project's owner (the sole member, notified
 * like admins and equally unable to raise limits themselves). All are
 * membership-derived roles — a platform admin without a project relation
 * does not qualify. The action is offered at any usage level — unlike the
 * near-limit banner, its visibility is not tied to the 80% threshold.
 */
export function canRequestMoreRuns(viewerRole: string | null | undefined): boolean {
  return (
    viewerRole === PROJECT_ROLE_ADMIN ||
    viewerRole === PROJECT_ROLE_EDITOR ||
    viewerRole === PROJECT_ROLE_PERSONAL_OWNER
  );
}

/**
 * Projects when the weekly limit will be reached at the current pace: the
 * elapsed share of the Mon–Sun week sets the run rate, and the returned
 * instant is when that rate reaches the limit. Null when there is no
 * meaningful projection: the limit is already met, there is no usage yet, the
 * week just started, or the pace won't reach the limit within this week.
 */
export function getProjectedWeeklyPauseDate(params: { used: number; limit: number | null; now?: Date }): Date | null {
  const { used, limit, now = new Date() } = params;
  if (limit === null || limit <= 0 || used <= 0 || used >= limit) {
    return null;
  }
  const weekStart = getCurrentWeekMonday(now);
  const elapsed = getVancouverAnchor(now).getTime() - weekStart.getTime();
  if (elapsed <= 0) {
    return null;
  }
  const projected = weekStart.getTime() + (limit * elapsed) / used;
  return projected < weekStart.getTime() + 7 * DAY_MS ? new Date(projected) : null;
}

const countFormat = new Intl.NumberFormat('en-CA');

/** Full number with comma grouping, e.g. 12,345. */
export function formatCount(count: number): string {
  return countFormat.format(count);
}

/**
 * Compact formatting for stat cards: "286K" from 10,000 up, "1.2M" from a
 * million up, full commas below that (9,999).
 */
export function formatCompactCount(count: number): string {
  if (count >= 1_000_000) {
    const millions = (count / 1_000_000).toFixed(1);
    const trimmed = millions.endsWith('.0') ? millions.slice(0, -2) : millions;
    return `${trimmed}M`;
  }
  if (count >= 10_000) {
    const thousands = Math.round(count / 1_000);
    // 999,500+ rounds up to 1000K — present it as 1M instead.
    return thousands >= 1_000 ? '1M' : `${thousands}K`;
  }
  return formatCount(count);
}

const VANCOUVER_TIME_ZONE = 'America/Vancouver';
const DAY_MS = 24 * 60 * 60 * 1000;

const shortDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TIME_ZONE,
  month: 'short',
  day: 'numeric',
});

const datedFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Sep 2" style date, rendered in the Vancouver time zone. */
export function formatShortDate(date: Date): string {
  return shortDateFormat.format(date);
}

const weekdayShortDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** "Mon, Nov 9" style weekday + short date, for compact reset mentions. */
export function formatWeekdayShortDate(date: Date): string {
  return weekdayShortDateFormat.format(date);
}

const resetWithWeekdayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TIME_ZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** "Mon, Nov 9, 2026" style reset date with its weekday (limit cards). */
export function formatResetDateWithWeekday(date: Date): string {
  return resetWithWeekdayFormat.format(date);
}

/** "Sep 2, 2026" style date, rendered in the Vancouver time zone. */
export function formatResetDate(date: Date): string {
  return datedFormat.format(date);
}

const weekdayDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: VANCOUVER_TIME_ZONE,
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

/** "Friday, Nov 6" style weekday date, rendered in the Vancouver time zone. */
export function formatWeekdayDate(date: Date): string {
  return weekdayDateFormat.format(date);
}

/**
 * Midday-UTC Date whose UTC calendar date equals the given instant's Vancouver
 * calendar date. Noon UTC is 4–5am in Vancouver, so the day never shifts, and
 * UTC arithmetic below is unaffected by DST transitions.
 */
function getVancouverAnchor(date: Date): Date {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: VANCOUVER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function getDaysSinceMonday(anchor: Date): number {
  return (anchor.getUTCDay() + 6) % 7;
}

/**
 * The Monday after the current Mon–Sun week in Vancouver — when weekly run
 * counters reset. On a Sunday this is the following day.
 */
export function getNextWeeklyReset(now: Date = new Date()): Date {
  const anchor = getVancouverAnchor(now);
  return new Date(anchor.getTime() + (7 - getDaysSinceMonday(anchor)) * DAY_MS);
}

/** January 1 of the year after the current Vancouver calendar year. */
export function getNextYearlyReset(now: Date = new Date()): Date {
  const anchor = getVancouverAnchor(now);
  return new Date(Date.UTC(anchor.getUTCFullYear() + 1, 0, 1, 12));
}

/** Label for the current Mon–Sun counting week, e.g. "Oct 26 to Nov 1". */
export function formatWeeklyPeriodLabel(now: Date = new Date()): string {
  const anchor = getVancouverAnchor(now);
  const weekStart = new Date(anchor.getTime() - getDaysSinceMonday(anchor) * DAY_MS);
  const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
  return `${formatShortDate(weekStart)} to ${formatShortDate(weekEnd)}`;
}

/* ------------------------------------------------------------------ */
/*  Weekly period keys (top-ups)                                       */
/* ------------------------------------------------------------------ */

/** Period options cover the current week plus the coming weeks (≈ half a year). */
export const TOPUP_PERIOD_HORIZON_WEEKS = 26;

const WEEKLY_KEY_PATTERN = /^(\d{4})-W(\d{2})$/;

/** The Monday (noon-UTC anchored) starting the current Mon–Sun counting week in Vancouver. */
function getCurrentWeekMonday(now: Date): Date {
  const anchor = getVancouverAnchor(now);
  return new Date(anchor.getTime() - getDaysSinceMonday(anchor) * DAY_MS);
}

/**
 * ISO-8601 weekly period key ('2026-W44') of the Mon–Sun counting week that
 * contains `now` in Vancouver — the same keys the server derives for
 * enforcement. The ISO week number is anchored to the week's Thursday: the
 * ISO year is the Thursday's year, and week 1 is the week containing Jan 4.
 */
export function getWeeklyPeriodKey(now: Date = new Date()): string {
  const weekStart = getCurrentWeekMonday(now);
  const thursday = new Date(weekStart.getTime() + 3 * DAY_MS);

  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4, 12));
  const firstMonday = jan4.getTime() - getDaysSinceMonday(jan4) * DAY_MS;
  const week = Math.floor((thursday.getTime() - firstMonday) / DAY_MS / 7) + 1;

  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** The Monday starting the given ISO weekly period key, or null for keys that cannot exist (e.g. week 53 in a 52-week year). */
function getWeekMonday(periodKey: string): Date | null {
  const match = WEEKLY_KEY_PATTERN.exec(periodKey);
  if (!match) {
    return null;
  }
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(isoYear, 0, 4, 12));
  const firstMonday = jan4.getTime() - getDaysSinceMonday(jan4) * DAY_MS;
  const monday = new Date(firstMonday + (week - 1) * 7 * DAY_MS);
  return getWeeklyPeriodKey(monday) === periodKey ? monday : null;
}

/** "Nov 2 to 8" / "Oct 26 to Nov 1" range text for a Mon–Sun week (month dropped when shared). */
function formatWeekRange(weekStart: Date, weekEnd: Date): string {
  const startText = formatShortDate(weekStart);
  const endText = formatShortDate(weekEnd);
  const [startMonth, startDay] = startText.split(' ');
  const [endMonth, endDay] = endText.split(' ');
  return startMonth === endMonth ? `${startMonth} ${startDay} to ${endDay}` : `${startText} to ${endText}`;
}

/** Date-range label for a weekly period key, e.g. '2026-W44' → "Oct 26 to Nov 1". */
export function formatWeeklyKeyRange(periodKey: string): string {
  const monday = getWeekMonday(periodKey);
  if (!monday) {
    return periodKey;
  }
  return formatWeekRange(monday, new Date(monday.getTime() + 6 * DAY_MS));
}

/**
 * Period-dropdown options for the current week plus the following weeks:
 * "This week (Oct 26 to Nov 1)" first, then plain ranges like "Nov 2 to 8".
 */
export function listUpcomingWeeklyPeriodOptions(
  count: number = TOPUP_PERIOD_HORIZON_WEEKS,
  now: Date = new Date(),
): Array<{ value: string; label: string }> {
  const currentMonday = getCurrentWeekMonday(now);
  const options: Array<{ value: string; label: string }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const monday = new Date(currentMonday.getTime() + offset * 7 * DAY_MS);
    const range = formatWeekRange(monday, new Date(monday.getTime() + 6 * DAY_MS));
    options.push({ value: getWeeklyPeriodKey(monday), label: offset === 0 ? `This week (${range})` : range });
  }
  return options;
}
