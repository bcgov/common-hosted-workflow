'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantProjectSyncService = void 0;
const project_roles_1 = require('../constants/project-roles');
const project_access_1 = require('./project-access');
const feature_flag_1 = require('../constants/feature-flag');
const logger_1 = require('../utils/logger');
const log = (0, logger_1.createLogger)('TenantProjectSyncService');
class TenantProjectSyncService {
  n8nRepositories;
  customRepositories;
  cstarService;
  featureFlagService;
  globalOwnerRoleSlug;
  globalOwnerUserId = null;
  constructor(n8nRepositories, customRepositories, cstarService, featureFlagService, globalOwnerRoleSlug) {
    this.n8nRepositories = n8nRepositories;
    this.customRepositories = customRepositories;
    this.cstarService = cstarService;
    this.featureFlagService = featureFlagService;
    this.globalOwnerRoleSlug = globalOwnerRoleSlug;
  }
  /**
   * Syncs tenant team projects for a user at login time.
   *
   * For each CSTAR tenant the user belongs to:
   * 1. Fetches the user's shared service roles for that tenant
   * 2. Determines the highest applicable n8n project role (editor > viewer)
   * 3. Creates the team project if it doesn't exist yet
   * 4. Adds/updates/removes the user's project relation based on current CSTAR roles
   */
  async syncTenantsForUser(params) {
    if (!this.featureFlagService.isFeatureEnabled(feature_flag_1.FEATURE.TENANT_PROJECT_SYNC)) {
      log.debug('Tenant project sync disabled via tenant-project-sync feature flag');
      return;
    }
    if (!this.cstarService.isConfigured()) {
      log.debug('CSTAR not configured, skipping tenant project sync');
      return;
    }
    const ownerUserId = await this.getGlobalOwnerUserId();
    if (!ownerUserId) {
      log.warn('Cannot sync tenant projects — no global owner user found');
      return;
    }
    const { ssoUserId, n8nUserId, accessToken, tenants: preFetchedTenants } = params;
    log.debug('Starting tenant project sync', { ssoUserId, n8nUserId });
    const tenants = preFetchedTenants ?? (await this.cstarService.getUserTenants({ ssoUserId, accessToken }));
    if (tenants.length > 0) {
      log.debug('Found CSTAR tenants for user', {
        ssoUserId,
        tenantCount: tenants.length,
        tenantNames: tenants.map((t) => t.name),
      });
      // Process tenants concurrently — each is independent
      const results = await Promise.allSettled(
        tenants.map((tenant) =>
          this.syncTenantForUser(tenant.id, tenant.name, n8nUserId, ssoUserId, accessToken, ownerUserId),
        ),
      );
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        log.warn('Some tenant syncs failed', {
          ssoUserId,
          n8nUserId,
          failedCount: failures.length,
          totalCount: tenants.length,
        });
      }
    }
    // Reconcile: remove relations for tenant projects that are no longer in CSTAR
    // When tenants is empty, this removes ALL managed team project relations
    const activeTenantIds = new Set(tenants.map((t) => t.id));
    await this.removeStaleTenantProjectRelations(n8nUserId, activeTenantIds, ownerUserId);
    log.debug('Tenant project sync completed', { ssoUserId, n8nUserId });
  }
  /**
   * Lazily resolves and caches the global owner user ID.
   * If not yet cached, queries the DB. Returns null if no owner exists.
   */
  async getGlobalOwnerUserId() {
    if (this.globalOwnerUserId) {
      return this.globalOwnerUserId;
    }
    const userId = await this.n8nRepositories.user.findUserIdByRoleSlug(this.globalOwnerRoleSlug);
    if (userId) {
      this.globalOwnerUserId = userId;
    }
    return userId;
  }
  async syncTenantForUser(tenantId, tenantName, n8nUserId, ssoUserId, accessToken, ownerUserId) {
    log.debug('Syncing tenant for user', { tenantId, tenantName, n8nUserId });
    const roles = await this.cstarService.getUserSharedServiceRoles({
      tenantId,
      ssoUserId,
      accessToken,
    });
    log.debug('CSTAR shared service roles for tenant', {
      tenantId,
      tenantName,
      roleCount: roles.length,
      roleNames: roles.map((r) => r.name),
    });
    // Determine the user's n8n project role from CSTAR roles
    const resolvedRole = this.resolveProjectRole(roles.map((r) => r.name));
    log.debug('Resolved n8n project role', { tenantId, tenantName, resolvedRole });
    // Check if the tenant project already exists
    const existingProjectId = await this.getExistingProjectIdForTenant(tenantId);
    if (existingProjectId) {
      // Project exists — sync the user's relation (add/update/remove)
      await this.syncUserProjectRelation(n8nUserId, existingProjectId, resolvedRole, tenantId, ownerUserId);
    } else if (resolvedRole) {
      // Project does NOT exist and user HAS a qualifying role — create it
      const projectId = await this.createTenantProject(tenantId, tenantName, ownerUserId);
      if (projectId) {
        await this.syncUserProjectRelation(n8nUserId, projectId, resolvedRole, tenantId, ownerUserId);
      }
    } else {
      // Project does NOT exist and user has NO qualifying role — skip
      log.debug('Skipping tenant project creation — user has no qualifying role', { tenantId, tenantName, n8nUserId });
    }
  }
  /**
   * Returns the first project ID linked to a tenant, or null if none exists.
   * The tenant_project_relation table enforces at most one project per tenant
   * via the unique index on project_id, and the composite PK on (tenant_id, project_id).
   */
  async getExistingProjectIdForTenant(tenantId) {
    const projectIds = await this.customRepositories.tenantProjectRelation.getProjectIdsByTenantId(tenantId);
    const projectId = projectIds[0];
    if (!projectId) {
      return null;
    }
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (project) {
      return projectId;
    }
    await this.customRepositories.workflowTrigger.deleteByProjectId(projectId);
    await this.customRepositories.message.deleteByProjectId(projectId);
    await this.customRepositories.actionRequest.deleteByProjectId(projectId);
    await this.customRepositories.auditLog.deleteByProjectId(projectId);
    await this.customRepositories.tenantProjectRelation.deleteByProjectId(projectId);
    log.warn('Deleted dangling tenant-project relation for missing n8n project', {
      tenantId,
      projectId,
    });
    return null;
  }
  resolveProjectRole(roleNames) {
    if (roleNames.includes(project_roles_1.PROJECT_ROLE_EDITOR)) {
      return project_roles_1.PROJECT_ROLE_EDITOR;
    }
    if (roleNames.includes(project_roles_1.PROJECT_ROLE_VIEWER)) {
      return project_roles_1.PROJECT_ROLE_VIEWER;
    }
    return null;
  }
  /**
   * Creates a new team project for a tenant.
   * Returns the project ID, or null if creation failed.
   *
   * Steps are executed in order with error handling to avoid orphaned state:
   * 1. Create the team project
   * 2. Link global owner as project:admin
   * 3. Map tenant to project (uses onConflictDoNothing to handle race conditions)
   */
  async createTenantProject(tenantId, tenantName, ownerUserId) {
    log.debug('Creating new team project for tenant', { tenantId, tenantName, creatorId: ownerUserId });
    // Create a new team project owned by the global owner
    const projectEntity = this.n8nRepositories.project.create({
      name: tenantName,
      type: 'team',
      creatorId: ownerUserId,
    });
    const savedProject = await this.n8nRepositories.project.save(projectEntity);
    log.debug('Team project created', { tenantId, tenantName, projectId: savedProject.id });
    // Link the global owner as project:admin
    await this.n8nRepositories.projectRelation.save({
      projectId: savedProject.id,
      userId: ownerUserId,
      role: { slug: project_roles_1.PROJECT_ROLE_ADMIN },
    });
    log.debug('Global owner linked as project:admin', { projectId: savedProject.id, userId: ownerUserId });
    // Map tenant to project — onConflictDoNothing handles the race condition
    // where another concurrent login already mapped this tenant
    await this.customRepositories.tenantProjectRelation.insertIgnoreConflict({
      tenantId,
      projectId: savedProject.id,
      projectType: 'team',
    });
    log.info('Created team project for tenant', {
      tenantId,
      tenantName,
      projectId: savedProject.id,
    });
    return savedProject.id;
  }
  /**
   * Removes managed project relations for tenants that are no longer in the user's CSTAR list.
   * Called after syncing active tenants — handles the case where a user was removed
   * from specific tenants but still has others.
   * When activeTenantIds is empty, removes the user from ALL tenant projects.
   */
  async removeStaleTenantProjectRelations(n8nUserId, activeTenantIds, ownerUserId) {
    const personalProject = await this.n8nRepositories.project.getPersonalProjectForUser(n8nUserId);
    const personalProjectId = personalProject?.id ?? null;
    const relations = await this.n8nRepositories.projectRelation.findAllByUser(n8nUserId);
    for (const relation of relations) {
      // Skip the personal project
      if (relation.projectId === personalProjectId) continue;
      // Check if this project is a tenant project
      const tenantId = await this.customRepositories.tenantProjectRelation.getTenantIdByProjectId(relation.projectId);
      if (!tenantId) continue;
      // Skip if tenant is still in the active CSTAR list (already synced above)
      if (activeTenantIds.has(tenantId)) continue;
      // Extract role slug from the relation (findAllByUser eagerly loads the role)
      const roleSlug = (0, project_access_1.extractRoleSlug)(relation);
      // Skip global owner's admin relation
      if (roleSlug === project_roles_1.PROJECT_ROLE_ADMIN && n8nUserId === ownerUserId) continue;
      // Only remove managed roles
      if (roleSlug && (0, project_roles_1.isManagedProjectRole)(roleSlug)) {
        await this.n8nRepositories.projectRelation.delete({ projectId: relation.projectId, userId: n8nUserId });
        log.info('Removed user from stale tenant project', {
          n8nUserId,
          projectId: relation.projectId,
          previousRole: roleSlug,
          tenantId,
        });
      }
    }
  }
  /**
   * Syncs a user's relation to a tenant project.
   * - Adds or updates the relation if the user has an allowed role
   * - Removes the relation if the user no longer has an allowed role
   */
  async syncUserProjectRelation(n8nUserId, projectId, resolvedRole, tenantId, ownerUserId) {
    const existingRelation = await this.n8nRepositories.projectRelation.findProjectRole({
      userId: n8nUserId,
      projectId,
    });
    const currentRoleSlug = (0, project_access_1.extractRoleSlug)(existingRelation);
    log.debug('Current user project relation', { n8nUserId, projectId, currentRoleSlug, resolvedRole, tenantId });
    // Skip if this user is the global owner (project:admin) — don't modify their relation
    if (currentRoleSlug === project_roles_1.PROJECT_ROLE_ADMIN && n8nUserId === ownerUserId) {
      log.debug('Skipping global owner relation — not modifiable', { n8nUserId, projectId });
      return;
    }
    if (resolvedRole) {
      if (!currentRoleSlug) {
        // Add new relation
        await this.n8nRepositories.projectRelation.save({
          projectId,
          userId: n8nUserId,
          role: { slug: resolvedRole },
        });
        log.info('Added user to tenant project', { n8nUserId, projectId, role: resolvedRole, tenantId });
      } else if (currentRoleSlug !== resolvedRole && (0, project_roles_1.isManagedProjectRole)(currentRoleSlug)) {
        // Update existing relation (only if the current role is one we manage)
        // Delete then re-save — n8n's project relation has a composite key
        await this.n8nRepositories.projectRelation.delete({ projectId, userId: n8nUserId });
        await this.n8nRepositories.projectRelation.save({
          projectId,
          userId: n8nUserId,
          role: { slug: resolvedRole },
        });
        log.info('Updated user role in tenant project', {
          n8nUserId,
          projectId,
          previousRole: currentRoleSlug,
          newRole: resolvedRole,
          tenantId,
        });
      } else {
        log.debug('User relation unchanged — already has correct role', {
          n8nUserId,
          projectId,
          currentRoleSlug,
          tenantId,
        });
      }
    } else if (currentRoleSlug && (0, project_roles_1.isManagedProjectRole)(currentRoleSlug)) {
      // Remove relation — user no longer has an allowed role in CSTAR
      await this.n8nRepositories.projectRelation.delete({ projectId, userId: n8nUserId });
      log.info('Removed user from tenant project', { n8nUserId, projectId, previousRole: currentRoleSlug, tenantId });
    } else {
      log.debug('No action needed — user has no CSTAR role and no managed relation', {
        n8nUserId,
        projectId,
        tenantId,
      });
    }
  }
}
exports.TenantProjectSyncService = TenantProjectSyncService;
