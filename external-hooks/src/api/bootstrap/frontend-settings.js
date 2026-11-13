"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyReadOnlyFrontendSettings = applyReadOnlyFrontendSettings;
exports.applyOidcFrontendSettings = applyOidcFrontendSettings;
const _config_1 = require("@config");
const n8n_oidc_1 = require("../helpers/n8n-oidc");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createLogger)('CustomAPIs');
/** Disables editor autosave in read-only mode to prevent repeated save failures and error toasts. */
function applyReadOnlyFrontendSettings(frontendSettings, isReadOnly = _config_1.READONLY_MODE) {
    if (!isReadOnly) {
        return;
    }
    frontendSettings.workflowsAutosaveDisabled = true;
}
function applyOidcFrontendSettings(frontendSettings) {
    const config = (0, n8n_oidc_1.getN8nOidcConfigFromEnv)();
    const missing = (0, n8n_oidc_1.validateN8nOidcConfig)(config);
    if (missing.length > 0) {
        return;
    }
    frontendSettings.sso = frontendSettings.sso || {};
    frontendSettings.sso.oidc = {
        loginEnabled: true,
        loginUrl: '/rest/auth/oidc/login',
        callbackUrl: config.redirectUri,
    };
    frontendSettings.userManagement = frontendSettings.userManagement || {};
    frontendSettings.userManagement.authenticationMethod = 'oidc';
    frontendSettings.enterprise = frontendSettings.enterprise || {};
    frontendSettings.enterprise.oidc = true;
    log.info('Frontend settings configured for OIDC');
}
