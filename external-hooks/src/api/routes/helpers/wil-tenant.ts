import type { Request } from 'express';
import type { TenantProjectRelationRepository } from '../../../db/repository/custom/tenant-project-relation';
import { X_TENANT_ID_HEADER } from '../../constants/headers';
import { tenantUuidRegex } from '../../constants/regex';
import { AppError } from '../../utils/errors';

/**
 * Validates the tenant ID and resolves its linked project IDs.
 * Throws `AppError` when the tenant ID is missing, not a valid UUID, or has no linked projects.
 * Used directly by route handlers that need both the tenantId and the projectIds.
 */
export async function resolveTenantProjectIds(
  tenantId: string | undefined,
  tenantProjectRelationRepository: TenantProjectRelationRepository,
): Promise<string[]> {
  if (!tenantId) {
    throw new AppError(400, `Missing ${X_TENANT_ID_HEADER} header`);
  }
  if (!tenantUuidRegex.test(tenantId)) {
    throw new AppError(400, `Invalid ${X_TENANT_ID_HEADER} (expected UUID)`);
  }
  const projectIds = await tenantProjectRelationRepository.getProjectIdsByTenantId(tenantId);
  if (projectIds.length === 0) {
    throw new AppError(403, 'No projects linked to this tenant. Please contact your tenant admin');
  }
  return projectIds;
}

/**
 * Extracts and validates the tenant ID from the request header.
 * Returns the raw tenant ID string (UUID).
 */
export function extractTenantId(req: Request): string {
  const tenantId = req.header(X_TENANT_ID_HEADER)?.trim();
  if (!tenantId) {
    throw new AppError(400, `Missing ${X_TENANT_ID_HEADER} header`);
  }
  if (!tenantUuidRegex.test(tenantId)) {
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
