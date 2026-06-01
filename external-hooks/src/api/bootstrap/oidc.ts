import { type Express } from 'express';
import { N8N_JWT_SERVICE_PATH, N8N_USER_SERVICE_PATH } from '../constants/n8n-paths';
import { getN8nOidcConfigFromEnv, validateN8nOidcConfig } from '../helpers/n8n-oidc';
import {
  buildOidcRouter,
  type N8nOidcDbCollections,
  type N8nOidcJwtService,
  type N8nOidcUserService,
} from '../routes/oidc';
import { createLogger } from '../utils/logger';
import type { N8nContainer } from './n8n-repositories';

const log = createLogger('CustomAPIs');

type MountOidcParams = {
  app: Express;
  dbCollections: N8nOidcDbCollections;
  container: N8nContainer;
};

export function mountOidc({ app, dbCollections, container }: MountOidcParams) {
  const config = getN8nOidcConfigFromEnv();
  const missing = validateN8nOidcConfig(config);

  if (missing.length > 0) {
    log.warn('Missing configuration — OIDC disabled', { missing: missing.join(', ') });
    return;
  }

  const { JwtService } = require(N8N_JWT_SERVICE_PATH) as { JwtService: unknown };
  const { UserService } = require(N8N_USER_SERVICE_PATH) as { UserService: unknown };
  const jwtService = container.get(JwtService) as N8nOidcJwtService;
  const userService = container.get(UserService) as N8nOidcUserService;

  app.use(
    '/rest/auth/oidc',
    buildOidcRouter({
      dbCollections,
      jwtService,
      userService,
      config,
    }),
  );
}
