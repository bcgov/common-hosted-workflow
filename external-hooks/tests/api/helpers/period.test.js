"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const period_1 = require("../../../src/api/helpers/period");
// RATE_LIMIT_TIMEZONE is unset in tests, so the helper runs with the
// documented default timezone: America/Vancouver (PST = UTC-8, PDT = UTC-7).
(0, vitest_1.describe)('getWeeklyPeriodKey', () => {
    (0, vitest_1.it)('formats a mid-year Monday with a zero-padded ISO week number', () => {
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-10-26T12:00:00Z'))).toBe('2026-W44');
    });
    (0, vitest_1.it)('formats a mid-year Wednesday in the same ISO week', () => {
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-06-10T12:00:00Z'))).toBe('2026-W24');
    });
    (0, vitest_1.it)('maps late-December dates to week 1 of the next ISO year', () => {
        // Monday 2024-12-30 is already week 1 of ISO year 2025.
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01');
        // Monday 2025-12-29 is already week 1 of ISO year 2026.
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2025-12-29T12:00:00Z'))).toBe('2026-W01');
    });
    (0, vitest_1.it)('keeps early-January dates in the final week of the prior ISO year', () => {
        // Friday 2027-01-01 and Sunday 2027-01-03 belong to 2026-W53.
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2027-01-03T12:00:00Z'))).toBe('2026-W53');
    });
    (0, vitest_1.it)('supports ISO years with 53 weeks', () => {
        // ISO year 2026 has 53 weeks (Jan 1 and Dec 31 are both Thursdays);
        // the week of 2026-12-28 is W53, not W52 or 2027-W01.
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-12-27T12:00:00Z'))).toBe('2026-W52');
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-12-28T12:00:00Z'))).toBe('2026-W53');
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-12-31T12:00:00Z'))).toBe('2026-W53');
    });
    (0, vitest_1.it)('starts a new ISO week at Vancouver Monday, not UTC Monday', () => {
        // 01:00 UTC Monday is still Sunday 18:00 PDT in Vancouver → previous week.
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-10-26T01:00:00Z'))).toBe('2026-W43');
        // 09:00 UTC Monday is Monday 02:00 PDT in Vancouver → new week.
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-10-26T09:00:00Z'))).toBe('2026-W44');
    });
    (0, vitest_1.it)('is stable across Vancouver DST transition days', () => {
        // Spring forward 2026-03-08: 02:00 PST jumps to 03:00 PDT (10:00 UTC).
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-03-08T09:00:00Z'))).toBe('2026-W10');
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-03-08T10:00:00Z'))).toBe('2026-W10');
        // Fall back 2026-11-01: 02:00 PDT returns to 01:00 PST (09:00 UTC).
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-11-01T08:00:00Z'))).toBe('2026-W44');
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)(new Date('2026-11-01T10:00:00Z'))).toBe('2026-W44');
    });
});
(0, vitest_1.describe)('getYearlyPeriodKey', () => {
    (0, vitest_1.it)('formats the calendar year of the instant in Vancouver', () => {
        (0, vitest_1.expect)((0, period_1.getYearlyPeriodKey)(new Date('2026-10-26T12:00:00Z'))).toBe('2026');
    });
    (0, vitest_1.it)('keeps the prior year while it is still that day in Vancouver', () => {
        // 23:30 UTC on Dec 31 is mid-afternoon Dec 31 in Vancouver.
        (0, vitest_1.expect)((0, period_1.getYearlyPeriodKey)(new Date('2026-12-31T23:30:00Z'))).toBe('2026');
        // Already Jan 1 in UTC, but still Dec 31 20:00 PST in Vancouver.
        (0, vitest_1.expect)((0, period_1.getYearlyPeriodKey)(new Date('2027-01-01T04:00:00Z'))).toBe('2026');
    });
    (0, vitest_1.it)('rolls over at Vancouver midnight, not UTC midnight', () => {
        // 00:15 PST on Jan 1 in Vancouver.
        (0, vitest_1.expect)((0, period_1.getYearlyPeriodKey)(new Date('2027-01-01T08:15:00Z'))).toBe('2027');
    });
});
(0, vitest_1.describe)('getCurrentPeriodKeys', () => {
    (0, vitest_1.it)('returns weekly and yearly keys for the same instant', () => {
        (0, vitest_1.expect)((0, period_1.getCurrentPeriodKeys)(new Date('2026-10-26T12:00:00Z'))).toEqual({
            weekly: '2026-W44',
            yearly: '2026',
        });
    });
    (0, vitest_1.it)('may disagree across years at ISO year boundaries', () => {
        // Friday 2027-01-01 is ISO week 2026-W53 but calendar year 2027.
        (0, vitest_1.expect)((0, period_1.getCurrentPeriodKeys)(new Date('2027-01-01T12:00:00Z'))).toEqual({
            weekly: '2026-W53',
            yearly: '2027',
        });
    });
});
(0, vitest_1.describe)('listWeeklyPeriodKeysOverlappingYearlyPeriod', () => {
    (0, vitest_1.it)('covers every ISO week of the year for a year that needs no straddling neighbours', () => {
        const keys = (0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)('2026');
        // 2026 spans ISO weeks 2026-W01 (Mon Dec 29, 2025) through 2026-W53.
        (0, vitest_1.expect)(keys[0]).toBe('2026-W01');
        (0, vitest_1.expect)(keys[keys.length - 1]).toBe('2026-W53');
        (0, vitest_1.expect)(keys).toHaveLength(53);
        (0, vitest_1.expect)(keys.some((key) => key.startsWith('2025-'))).toBe(false);
    });
    (0, vitest_1.it)('includes the straddling previous-year week when Jan 1 falls inside it', () => {
        // Fri Jan 1, 2027 belongs to ISO week 2026-W53 (Mon Dec 28, 2026 – Sun Jan 3, 2027).
        const keys = (0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)('2027');
        (0, vitest_1.expect)(keys[0]).toBe('2026-W53');
        (0, vitest_1.expect)(keys).toContain('2027-W01');
    });
    (0, vitest_1.it)('contains the weekly key of every day of the year (noon-UTC samples share the Vancouver date)', () => {
        const keys = (0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)('2026');
        const set = new Set(keys);
        for (const day of ['2026-01-01', '2026-06-15', '2026-12-31']) {
            (0, vitest_1.expect)(set.has((0, period_1.getWeeklyPeriodKey)(new Date(`${day}T12:00:00Z`)))).toBe(true);
        }
    });
    (0, vitest_1.it)('returns the memoized array for repeated calls', () => {
        (0, vitest_1.expect)((0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)('2026')).toBe((0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)('2026'));
    });
    (0, vitest_1.it)('returns an empty list for a malformed yearly key', () => {
        (0, vitest_1.expect)((0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)('20X6')).toEqual([]);
        (0, vitest_1.expect)((0, period_1.listWeeklyPeriodKeysOverlappingYearlyPeriod)('')).toEqual([]);
    });
});
(0, vitest_1.describe)('period keys default to the current time', () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('compute keys from the system clock when no date is passed', () => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
        (0, vitest_1.expect)((0, period_1.getWeeklyPeriodKey)()).toBe('2026-W44');
        (0, vitest_1.expect)((0, period_1.getYearlyPeriodKey)()).toBe('2026');
        (0, vitest_1.expect)((0, period_1.getCurrentPeriodKeys)()).toEqual({ weekly: '2026-W44', yearly: '2026' });
    });
});
(0, vitest_1.describe)('RATE_LIMIT_TIMEZONE handling', () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.unstubAllEnvs();
    });
    (0, vitest_1.it)('honours a valid configured timezone', async () => {
        vitest_1.vi.stubEnv('RATE_LIMIT_TIMEZONE', 'UTC');
        vitest_1.vi.resetModules();
        const { getYearlyPeriodKey: getYearlyPeriodKeyInUtc } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/period')));
        // 04:00 UTC on Jan 1 is Jan 1 in UTC, unlike Vancouver (still Dec 31).
        (0, vitest_1.expect)(getYearlyPeriodKeyInUtc(new Date('2027-01-01T04:00:00Z'))).toBe('2027');
    });
    (0, vitest_1.it)('falls back to America/Vancouver when the configured timezone is invalid', async () => {
        vitest_1.vi.stubEnv('RATE_LIMIT_TIMEZONE', 'Not/AZone');
        vitest_1.vi.resetModules();
        const { getCurrentPeriodKeys: getCurrentPeriodKeysWithBadTz } = await Promise.resolve().then(() => __importStar(require('../../../src/api/helpers/period')));
        // Invalid zone must not throw; keys keep default Vancouver semantics
        // (still Dec 31 there), not UTC semantics.
        (0, vitest_1.expect)(getCurrentPeriodKeysWithBadTz(new Date('2027-01-01T04:00:00Z'))).toEqual({
            weekly: '2026-W53',
            yearly: '2026',
        });
    });
});
(0, vitest_1.describe)('getNextWeeklyReset', () => {
    (0, vitest_1.it)('returns the Monday after the current Mon–Sun week', () => {
        // Wednesday Nov 4, 2026 → reset Monday Nov 9 (noon-UTC anchored).
        (0, vitest_1.expect)((0, period_1.formatPeriodDateLong)((0, period_1.getNextWeeklyReset)(new Date('2026-11-04T20:00:00Z')))).toBe('Monday, November 9, 2026');
    });
    (0, vitest_1.it)('returns the next day when the run happens on a Sunday', () => {
        // Sunday Nov 1, 2026 (PDT) → reset Monday Nov 2.
        (0, vitest_1.expect)((0, period_1.formatPeriodDateLong)((0, period_1.getNextWeeklyReset)(new Date('2026-11-01T20:00:00Z')))).toBe('Monday, November 2, 2026');
    });
});
(0, vitest_1.describe)('getNextYearlyReset', () => {
    (0, vitest_1.it)('returns January 1 of the next Vancouver calendar year', () => {
        (0, vitest_1.expect)((0, period_1.formatPeriodDateLong)((0, period_1.getNextYearlyReset)(new Date('2026-11-04T20:00:00Z')))).toBe('Friday, January 1, 2027');
    });
    (0, vitest_1.it)('already targets the next year for runs on late-December Vancouver dates', () => {
        // Dec 31, 2026 16:00 UTC is still Dec 31 in Vancouver → reset Jan 1, 2027.
        (0, vitest_1.expect)((0, period_1.formatPeriodDateLong)((0, period_1.getNextYearlyReset)(new Date('2026-12-31T16:00:00Z')))).toBe('Friday, January 1, 2027');
    });
});
(0, vitest_1.describe)('describeWeeklyPeriodKey', () => {
    (0, vitest_1.it)('formats a mid-month week with the month dropped from the end date', () => {
        // 2026-W45 starts Monday Nov 2, 2026.
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('2026-W45')).toBe('Nov 2 to 8, 2026');
    });
    (0, vitest_1.it)('keeps both months when the week straddles a month boundary', () => {
        // 2026-W44 starts Monday Oct 26, 2026 and ends Sunday Nov 1.
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('2026-W44')).toBe('Oct 26 to Nov 1, 2026');
    });
    (0, vitest_1.it)('formats the ISO year-boundary week with the correct year', () => {
        // 2026-W01 starts Monday Dec 29, 2025.
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('2026-W01')).toBe('Dec 29 to Jan 4, 2026');
    });
    (0, vitest_1.it)('returns null for keys that cannot exist, so callers can fall back to the raw key', () => {
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('2026-W53')).toBe('Dec 28 to Jan 3, 2027'); // real 53rd week
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('2027-W53')).toBeNull(); // ISO 2027 has 52 weeks
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('2026-W00')).toBeNull();
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('2026')).toBeNull();
        (0, vitest_1.expect)((0, period_1.describeWeeklyPeriodKey)('not-a-key')).toBeNull();
    });
});
