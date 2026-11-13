'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.mountOidc = mountOidc;
const n8n_oidc_1 = require('../helpers/n8n-oidc');
const oidc_1 = require('../routes/oidc');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('CustomAPIs');
function mountOidc({
  app,
  n8nRepositories,
  customRepositories,
  authService,
  jwtService,
  userService,
  tenantProjectSyncService,
  tenantService,
  cstarService,
}) {
  const config = (0, n8n_oidc_1.getN8nOidcConfigFromEnv)();
  const missing = (0, n8n_oidc_1.validateN8nOidcConfig)(config);
  if (missing.length > 0) {
    log.warn('Missing configuration — OIDC disabled', { missing: missing.join(', ') });
    return;
  }
  app.use(
    '/rest/auth/oidc',
    (0, oidc_1.buildOidcRouter)({
      n8nRepositories,
      customRepositories,
      authService,
      jwtService,
      userService,
      tenantProjectSyncService,
      tenantService,
      cstarService,
      config,
    }),
  );
}
