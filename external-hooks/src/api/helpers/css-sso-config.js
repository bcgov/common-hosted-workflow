"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCssSsoConfig = getCssSsoConfig;
const _config_1 = require("@config");
const REQUIRED_VALUES = [
    _config_1.AUTHZ_SERVICE_URL,
    _config_1.AUTHZ_INTEGRATION_ID,
    _config_1.AUTHZ_ENVIRONMENT,
    _config_1.AUTHZ_TOKEN_ENDPOINT,
    _config_1.AUTHZ_CLIENT_ID,
    _config_1.AUTHZ_CLIENT_SECRET,
];
function getCssSsoConfig() {
    if (REQUIRED_VALUES.some((v) => !v)) {
        return null;
    }
    return {
        baseUrl: _config_1.AUTHZ_SERVICE_URL,
        integrationId: _config_1.AUTHZ_INTEGRATION_ID,
        environment: _config_1.AUTHZ_ENVIRONMENT,
        tokenEndpoint: _config_1.AUTHZ_TOKEN_ENDPOINT,
        clientId: _config_1.AUTHZ_CLIENT_ID,
        clientSecret: _config_1.AUTHZ_CLIENT_SECRET,
    };
}
