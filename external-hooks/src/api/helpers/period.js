"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeeklyPeriodKey = getWeeklyPeriodKey;
exports.getYearlyPeriodKey = getYearlyPeriodKey;
exports.getCurrentPeriodKeys = getCurrentPeriodKeys;
exports.getNextWeeklyReset = getNextWeeklyReset;
exports.getNextYearlyReset = getNextYearlyReset;
exports.formatPeriodDateLong = formatPeriodDateLong;
exports.describeWeeklyPeriodKey = describeWeeklyPeriodKey;
exports.listUpcomingWeeklyPeriodKeys = listUpcomingWeeklyPeriodKeys;
exports.listWeeklyPeriodKeysOverlappingYearlyPeriod = listWeeklyPeriodKeysOverlappingYearlyPeriod;
const _config_1 = require("@config");
const MS_PER_DAY = 86_400_000;
const DEFAULT_TIMEZONE = 'America/Vancouver';
// An operator-provided RATE_LIMIT_TIMEZONE that Intl rejects (typo, retired
// zone name) must not take rate-limit enforcement down with it, so an invalid
// value falls back to the documented default instead of throwing at call time.
// Config already defaults empty values; this validation is purely defensive.
function resolvePeriodTimezone(timeZone) {
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone });
        return timeZone;
    }
    catch {
        return DEFAULT_TIMEZONE;
    }
}
// 'en-CA' yields plain numeric Y/M/D parts; formatToParts is walked by part
// type, so the exact literal/segment ordering never matters.
const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolvePeriodTimezone(_config_1.RATE_LIMIT_TIMEZONE),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});
/** Calendar year / month / day of `date` as seen in the period timezone (DST-safe via Intl). */
function getLocalDate(date) {
    const parts = { year: 0, month: 0, day: 0 };
    for (const part of localDateFormatter.formatToParts(date)) {
        if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
            parts[part.type] = Number(part.value);
        }
    }
    return parts;
}
/** ISO-8601 weekday (1 = Monday … 7 = Sunday) of a UTC-midnight timestamp. */
function getIsoDayOfWeek(utcMidnight) {
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
function getIsoWeek(localDate) {
    const localMidnight = Date.UTC(localDate.year, localDate.month - 1, localDate.day);
    const thursday = localMidnight + (4 - getIsoDayOfWeek(localMidnight)) * MS_PER_DAY;
    const isoYear = new Date(thursday).getUTCFullYear();
    const jan4 = Date.UTC(isoYear, 0, 4);
    const firstThursday = jan4 + (4 - getIsoDayOfWeek(jan4)) * MS_PER_DAY;
    const week = 1 + (thursday - firstThursday) / (7 * MS_PER_DAY);
    return { isoYear, week };
}
function formatWeeklyKey(isoYear, week) {
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
/** Weekly rate-limit period key (`'YYYY-Www'`, ISO-8601 week) of `date` in the period timezone. */
function getWeeklyPeriodKey(date = new Date()) {
    const { isoYear, week } = getIsoWeek(getLocalDate(date));
    return formatWeeklyKey(isoYear, week);
}
/** Yearly rate-limit period key (`'YYYY'`, calendar year) of `date` in the period timezone. */
function getYearlyPeriodKey(date = new Date()) {
    return `${getLocalDate(date).year}`;
}
/** Weekly and yearly rate-limit period keys of `date`, from a single local-date lookup. */
function getCurrentPeriodKeys(date = new Date()) {
    const localDate = getLocalDate(date);
    const { isoYear, week } = getIsoWeek(localDate);
    return { weekly: formatWeeklyKey(isoYear, week), yearly: `${localDate.year}` };
}
/** LocalDate of a UTC-midnight timestamp (inverse of `Date.UTC(y, m, d)`). */
function getUtcMidnightLocalDate(utcMidnight) {
    const date = new Date(utcMidnight);
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
/** Noon-UTC Date whose UTC calendar date equals `date`'s calendar date in the period timezone. */
function getPeriodAnchor(date) {
    const { year, month, day } = getLocalDate(date);
    return new Date(Date.UTC(year, month - 1, day, 12));
}
function getDaysSinceMonday(date) {
    return (date.getUTCDay() + 6) % 7;
}
/** The Monday after the current Mon–Sun period week — when weekly counters reset. */
function getNextWeeklyReset(date = new Date()) {
    const anchor = getPeriodAnchor(date);
    return new Date(anchor.getTime() + (7 - getDaysSinceMonday(anchor)) * MS_PER_DAY);
}
/** January 1 (noon UTC) of the year after the current period-timezone calendar year. */
function getNextYearlyReset(date = new Date()) {
    const anchor = getPeriodAnchor(date);
    return new Date(Date.UTC(anchor.getUTCFullYear() + 1, 0, 1, 12));
}
// Anchor formatters: reset dates and week ranges are produced as UTC-anchored
// Dates whose UTC calendar date equals the period-timezone calendar date, so
// they must be rendered in UTC — rendering the anchor instant in the period
// timezone would shift the calendar day (UTC midnight = 4–5pm the previous
// day in Vancouver).
const periodShortDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
});
const periodLongDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
});
/**
 * 'Monday, November 9, 2026' style description of a period-timezone calendar
 * date. Expects a UTC-anchored Date (from getNextWeeklyReset /
 * getNextYearlyReset): its UTC calendar date is the period calendar date.
 */
function formatPeriodDateLong(date) {
    return periodLongDateFormatter.format(date);
}
/** The Monday (UTC-midnight anchor) starting the ISO week of the given weekly period key, or null for keys that cannot exist. */
function getWeeklyPeriodKeyMonday(periodKey) {
    const match = /^(\d{4})-W(\d{2})$/.exec(periodKey);
    if (!match || Number(match[2]) < 1) {
        return null;
    }
    const isoYear = Number(match[1]);
    const week = Number(match[2]);
    const jan4 = Date.UTC(isoYear, 0, 4);
    const firstMonday = jan4 - (getIsoDayOfWeek(jan4) - 1) * MS_PER_DAY;
    const monday = firstMonday + (week - 1) * 7 * MS_PER_DAY;
    // Week 53 in a 52-week ISO year rolls into the next year — not a real key.
    return getIsoWeek(getUtcMidnightLocalDate(monday)).isoYear === isoYear ? monday : null;
}
/**
 * 'Nov 2 to 8, 2026' style description of a weekly period key (month dropped
 * when both dates share it), in the period timezone. Returns null for keys
 * that cannot exist — callers fall back to the raw key.
 */
function describeWeeklyPeriodKey(periodKey) {
    const monday = getWeeklyPeriodKeyMonday(periodKey);
    if (monday === null) {
        return null;
    }
    const startText = periodShortDateFormatter.format(new Date(monday));
    const end = monday + 6 * MS_PER_DAY;
    const endText = periodShortDateFormatter.format(new Date(end));
    const [startMonth, startDay] = startText.split(' ');
    const [endMonth, endDay] = endText.split(' ');
    const range = startMonth === endMonth ? `${startMonth} ${startDay} to ${endDay}` : `${startText} to ${endText}`;
    return `${range}, ${getUtcMidnightLocalDate(end).year}`;
}
/**
 * Consecutive weekly period keys ('YYYY-Www'), starting with the ISO week that
 * contains `date` (the current week) and extending `count - 1` weeks into the
 * future, in the period timezone. Drives the top-up period horizon; stepping
 * whole weeks keeps ISO-week rollovers (including year boundaries) correct.
 */
function listUpcomingWeeklyPeriodKeys(count, date = new Date()) {
    const localDate = getLocalDate(date);
    const localMidnight = Date.UTC(localDate.year, localDate.month - 1, localDate.day);
    const weekStart = localMidnight - (getIsoDayOfWeek(localMidnight) - 1) * MS_PER_DAY;
    const keys = [];
    for (let offset = 0; offset < count; offset += 1) {
        const { isoYear, week } = getIsoWeek(getUtcMidnightLocalDate(weekStart + offset * 7 * MS_PER_DAY));
        keys.push(formatWeeklyKey(isoYear, week));
    }
    return keys;
}
/** Weekly period keys that overlap a yearly period, memoized per year (one tiny entry per year). */
const yearlyOverlapCache = new Map();
/**
 * Weekly period keys whose Mon–Sun week contains at least one calendar day of
 * the given yearly period ('YYYY', period-timezone calendar year).
 *
 * Usually these are exactly the year's own ISO weeks, but the one or two ISO
 * weeks straddling Jan 1 also overlap the neighbouring year — and because a
 * run's yearly usage is bucketed by its calendar day, a weekly top-up must
 * raise the yearly limit of every year its week overlaps for the two gates to
 * stay consistent. Returns an empty list for malformed keys.
 */
function listWeeklyPeriodKeysOverlappingYearlyPeriod(yearlyKey) {
    const cached = yearlyOverlapCache.get(yearlyKey);
    if (cached) {
        return cached;
    }
    if (!/^\d{4}$/.test(yearlyKey)) {
        return [];
    }
    const year = Number(yearlyKey);
    const jan1 = Date.UTC(year, 0, 1);
    const dec31 = Date.UTC(year, 11, 31);
    const weekStart = jan1 - (getIsoDayOfWeek(jan1) - 1) * MS_PER_DAY;
    const keys = [];
    for (let monday = weekStart; monday <= dec31; monday += 7 * MS_PER_DAY) {
        const { isoYear, week } = getIsoWeek(getUtcMidnightLocalDate(monday));
        keys.push(formatWeeklyKey(isoYear, week));
    }
    yearlyOverlapCache.set(yearlyKey, keys);
    return keys;
}
