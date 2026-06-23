import { type Express } from 'express';
import { getN8nOidcConfigFromEnv, validateN8nOidcConfig } from '../helpers/n8n-oidc';
import { buildOidcRouter } from '../routes/oidc';
import type { JwtService } from '../services/jwt';
import type { TenantProjectSyncService } from '../services/tenant-project-sync.service';
import type { UserService } from '../services/user';
import { createLogger } from '../utils/logger';
import type { N8nRepositories } from './n8n-repositories';

const log = createLogger('CustomAPIs');

type MountOidcParams = {
  app: Express;
  n8nRepositories: N8nRepositories;
  jwtService: JwtService;
  userService: UserService;
  tenantProjectSyncService: TenantProjectSyncService;
};

export function mountOidc({
  app,
  n8nRepositories,
  jwtService,
  userService,
  tenantProjectSyncService,
}: MountOidcParams) {
  const config = getN8nOidcConfigFromEnv();
  const missing = validateN8nOidcConfig(config);

  if (missing.length > 0) {
    log.warn('Missing configuration — OIDC disabled', { missing: missing.join(', ') });
    return;
  }

  app.use(
    '/rest/auth/oidc',
    buildOidcRouter({
      n8nRepositories,
      jwtService,
      userService,
      tenantProjectSyncService,
      config,
    }),
  );
}
