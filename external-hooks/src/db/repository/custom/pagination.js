"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPaginationClauses = buildPaginationClauses;
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Builds Drizzle WHERE clauses for time-based or cursor-based pagination.
 * Intended to be called from the service layer; repositories accept the
 * resulting clauses directly.
 */
function buildPaginationClauses(table, paginationSince) {
    if (!paginationSince)
        return [];
    if (paginationSince.mode === 'time') {
        return [(0, drizzle_orm_1.gte)(table.createdAt, paginationSince.since)];
    }
    return [
        (0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(table.createdAt, paginationSince.createdAt), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(table.createdAt, paginationSince.createdAt), (0, drizzle_orm_1.lt)(table.id, paginationSince.id))),
    ];
}
