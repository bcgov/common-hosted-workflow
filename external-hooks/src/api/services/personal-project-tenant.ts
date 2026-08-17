import crypto from 'node:crypto';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
import { createLogger } from '../utils/logger';

const log = createLogger('PersonalProjectTenant');

export async function ensurePersonalProjectTenantMapping(params: {
  userId: string;
  projectRepo: N8nRepositories['project'];
  tenantProjectRelationRepository: TenantProjectRelationRepository;
  reason: string;
}): Promise<void> {
  const { userId, projectRepo, tenantProjectRelationRepository, reason } = params;

  const personalProject = await projectRepo.getPersonalProjectForUser(userId);
  if (!personalProject) {
    log.warn('No personal project found, skipping tenant assignment', { userId, reason });
    return;
  }

  const existingTenantId = await tenantProjectRelationRepository.getTenantIdByProjectId(personalProject.id);
  if (existingTenantId) {
    log.info('Personal project already has a tenant mapping, skipping', {
      userId,
      reason,
      tenantId: existingTenantId,
    });
    return;
  }

  const tenantId = crypto.randomUUID();
  await tenantProjectRelationRepository.insertIgnoreConflict({
    tenantId,
    projectId: personalProject.id,
    projectType: 'personal',
  });

  log.info('Assigned tenant to personal project', {
    userId,
    reason,
    projectId: personalProject.id,
    tenantId,
  });
}
