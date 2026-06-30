import type { Request } from 'express';
import type { TenantProjectRelationRepository } from '../../../db/repository/custom/tenant-project-relation';
import { AppError } from '../../utils/errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const X_TENANT_ID_HEADER = 'x-tenant-id';

/**
 * Extracts and validates the tenant ID from the request header.
 * Returns the raw tenant ID string (UUID).
 */
export function extractTenantId(req: Request): string {
  const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
  if (!tenantId) {
    throw new AppError(400, `Missing ${X_TENANT_ID_HEADER} header`);
  }
  if (!UUID_REGEX.test(tenantId)) {
    throw new AppError(400, `Invalid ${X_TENANT_ID_HEADER} (expected UUID)`);
  }
  return tenantId;
}

export type WilTenantScope = {
  tenantId: string;
  projectIds: string[];
};

export async function resolveWilTenantProjectIds(
  req: Request,
  tenantProjectRelationRepository: TenantProjectRelationRepository,
): Promise<WilTenantScope> {
  const tenantId = extractTenantId(req);

  const projectIds = await tenantProjectRelationRepository.getProjectIdsByTenantId(tenantId);
  if (projectIds.length === 0) {
    throw new AppError(403, 'No projects linked to this tenant. Please contact your tenant admin');
  }

  // TODO: Integrate CSTAR API for tenant access verification
  return { tenantId, projectIds };
}
