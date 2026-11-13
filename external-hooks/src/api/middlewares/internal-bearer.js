"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInternalBearerMiddleware = createInternalBearerMiddleware;
const headers_1 = require("../constants/headers");
const bearer_1 = require("../helpers/bearer");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const _config_1 = require("@config");
const log = (0, logger_1.createLogger)('CustomAPIs');
/**
 * Internal-only bearer auth. Validates `Authorization: Bearer <INTERNAL_AUTH_TOKEN>`
 * and nothing else. Use for endpoints that the n8n runtime itself calls
 * (e.g. node helpers) — no API key or tenant scoping.
 */
function createInternalBearerMiddleware() {
    return async (req, _res, next) => {
        if (!_config_1.INTERNAL_AUTH_TOKEN) {
            log.warn('INTERNAL_AUTH_TOKEN not configured', { handler: 'internalBearer', statusCode: 500 });
            return next(new errors_1.AppError(500, 'INTERNAL_AUTH_TOKEN not configured'));
        }
        const bearerToken = (0, bearer_1.extractBearerToken)(req.header(headers_1.AUTHORIZATION_HEADER));
        if (!bearerToken || bearerToken !== _config_1.INTERNAL_AUTH_TOKEN) {
            log.warn('Internal bearer auth failed', { handler: 'internalBearer', statusCode: 401 });
            return next(new errors_1.AppError(401, 'Unauthorized'));
        }
        next();
    };
}
