"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPaginationCursorUuidRegex = exports.tenantUuidRegex = void 0;
/** UUID v1–v8 tenant id pattern (matches PostgreSQL uuid validation style used for `X-TENANT-ID`). */
exports.tenantUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** UUID segment after `|` in list pagination `since` / `nextCursor` (`iso|id`). */
exports.listPaginationCursorUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
