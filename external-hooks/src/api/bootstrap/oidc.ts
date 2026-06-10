import { type Express } from 'express';
import { N8N_JWT_SERVICE_PATH, N8N_USER_SERVICE_PATH } from '../constants/n8n-paths';
import { getN8nOidcConfigFromEnv, validateN8nOidcConfig } from '../helpers/n8n-oidc';
import { buildOidcRouter, type N8nOidcJwtService } from '../routes/oidc';
import type { N8nUserRoleService } from '../types/n8n-services';
import { createLogger } from '../utils/logger';
import type { N8nContainer, N8nRepositories } from './n8n-repositories';

const log = createLogger('CustomAPIs');

type MountOidcParams = {
  app: Express;
  n8nRepositories: N8nRepositories;
  container: N8nContainer;
};

export function mountOidc({ app, n8nRepositories, container }: MountOidcParams) {
  const config = getN8nOidcConfigFromEnv();
  const missing = validateN8nOidcConfig(config);

  if (missing.length > 0) {
    log.warn('Missing configuration — OIDC disabled', { missing: missing.join(', ') });
    return;
  }

  const { JwtService } = require(N8N_JWT_SERVICE_PATH) as { JwtService: unknown };
  const { UserService } = require(N8N_USER_SERVICE_PATH) as { UserService: unknown };
  const jwtService = container.get(JwtService) as N8nOidcJwtService;
  const userService = container.get(UserService) as N8nUserRoleService;

  app.use(
    '/rest/auth/oidc',
    buildOidcRouter({
      n8nRepositories,
      jwtService,
      userService,
      config,
    }),
  );
}
