/** UUID v1–v8 tenant id pattern (matches PostgreSQL uuid validation style used for `X-TENANT-ID`). */
export const tenantUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
