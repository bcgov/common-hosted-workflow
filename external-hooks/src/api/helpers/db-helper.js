"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDbErrorForLog = formatDbErrorForLog;
exports.normalizeCreateActionTimestamps = normalizeCreateActionTimestamps;
const parse_1 = require("../utils/parse");
/** Walks Error.cause chains (Drizzle → driver) so CHECK/FK violations show `code` / `constraint` / `detail`. */
function formatDbErrorForLog(error) {
    const segments = [];
    let e = error;
    for (let depth = 0; e && depth < 8; depth++) {
        if (!(e instanceof Error))
            break;
        const x = e;
        const bit = [
            x.message,
            x.code && `code=${x.code}`,
            x.constraint && `constraint=${x.constraint}`,
            x.detail && `detail=${x.detail}`,
        ]
            .filter(Boolean)
            .join(' ');
        if (bit)
            segments.push(bit);
        e = x.cause;
    }
    return segments.join(' || ');
}
/** Converts validated create-body `dueDate` / `checkIn` strings into DB `timestamp` columns (null when absent). */
function optionalBodyTimestampToDb(value) {
    if (value === undefined || value === null)
        return null;
    const d = (0, parse_1.parseOptionalBodyTimestamp)(value);
    return d ?? null;
}
/** Maps optional `dueDate` / `checkIn` from the request body to nullable `Date` for Drizzle insert. */
function normalizeCreateActionTimestamps(body) {
    return {
        dueDate: optionalBodyTimestampToDb(body.dueDate),
        checkIn: optionalBodyTimestampToDb(body.checkIn),
    };
}
