"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractBearerToken = extractBearerToken;
/** Extracts the bearer token from `Authorization: Bearer <token>`. */
function extractBearerToken(authorizationHeader) {
    if (!authorizationHeader)
        return null;
    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
    return match?.[1]?.trim?.() ?? null;
}
