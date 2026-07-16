import { Router } from 'express';
import type { ApiRouteContext } from '../types/routes';
import type { UiResolvedSession } from '../helpers/ui-oidc';
import { resolveWilTenantProjectIds } from './helpers/wil-tenant';
import { OkResponse } from './responses';
import { getBearerToken } from '../helpers/ui-oidc-session';
import { CSTAR_WORKFLOW_SERVICE_ROLES } from '../constants/cstar-roles';
import { createLogger } from '../utils/logger';

const log = createLogger('CstarRoutes');

/**
 * Builds the CSTAR sub-router for the UI API.
 * Mounted under /wil/cstar — provides role and group data
 * for the trigger/action configuration forms.
 *
 * GET /roles — Returns workflow service roles (from env var)
 * GET /groups — Fetches groups from CSTAR API for the current tenant
 */
export function buildCstarRouter(routeContext: ApiRouteContext) {
  const { services, customRepositories } = routeContext;
  const router = Router();

  /**
   * GET /roles — Returns the list of workflow service roles.
   */
  router.get('/roles', (_req, res) => {
    OkResponse(res, { roles: [...CSTAR_WORKFLOW_SERVICE_ROLES] });
  });

  /**
   * GET /groups — Fetches all groups for the tenant from CSTAR.
   * Uses the tenant ID from the X-TENANT-ID header and the user's
   * OIDC access token for authentication.
   * Returns an empty array on any error.
   */
  router.get('/groups', async (req, res) => {
    const { tenantId } = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      log.warn('No access token available for CSTAR groups fetch', { email: session.email });
      OkResponse(res, { groups: [] });
      return;
    }

    if (!services.cstar.isConfigured()) {
      log.debug('CSTAR not configured, returning empty groups');
      OkResponse(res, { groups: [] });
      return;
    }

    const groups = await services.cstar.getTenantGroups({ tenantId, accessToken });
    OkResponse(res, { groups: groups.map((g) => g.name) });
  });

  /**
   * GET /users — Fetches all users for the tenant from CSTAR.
   * Returns display name and email for the combobox dropdown.
   * Returns an empty array on any error.
   */
  router.get('/users', async (req, res) => {
    const { tenantId } = await resolveWilTenantProjectIds(req, customRepositories.tenantProjectRelation);
    const session = (req as unknown as { session: UiResolvedSession }).session;
    const accessToken = getBearerToken(req);

    if (!accessToken) {
      log.warn('No access token available for CSTAR users fetch', { email: session.email });
      OkResponse(res, { users: [] });
      return;
    }

    if (!services.cstar.isConfigured()) {
      log.debug('CSTAR not configured, returning empty users');
      OkResponse(res, { users: [] });
      return;
    }

    const tenantUsers = await services.cstar.getTenantUsers({ tenantId, accessToken });
    const users = tenantUsers
      .filter((u) => !u.isDeleted && u.ssoUser?.email)
      .map((u) => u.ssoUser.email);
    OkResponse(res, { users });
  });

  return router;
}
