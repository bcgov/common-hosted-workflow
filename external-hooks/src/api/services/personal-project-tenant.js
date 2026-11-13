'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.ensurePersonalProjectTenantMapping = ensurePersonalProjectTenantMapping;
const node_crypto_1 = __importDefault(require('node:crypto'));
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('PersonalProjectTenant');
async function ensurePersonalProjectTenantMapping(params) {
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
  const tenantId = node_crypto_1.default.randomUUID();
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
