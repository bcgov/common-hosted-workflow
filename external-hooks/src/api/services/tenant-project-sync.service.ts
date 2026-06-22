import { IS_TENANT_PROJECT_SYNC_ENABLED } from '@config';
import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { CstarService } from './cstar.service';
import {
  PROJECT_ROLE_ADMIN,
  PROJECT_ROLE_EDITOR,
  PROJECT_ROLE_VIEWER,
  isManagedProjectRole,
  type ManagedProjectRole,
} from '../constants/project-roles';
import { createLogger } from '../utils/logger';

const log = createLogger('TenantProjectSyncService');

export type SyncTenantsForUserParams = {
  ssoUserId: string;
  n8nUserId: string;
  accessToken: string;
};

export class TenantProjectSyncService {
  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly customRepositories: CustomRepositories,
    private readonly cstarService: CstarService,
    private readonly globalOwnerUserId: string,
  ) {}

  /**
   * Syncs tenant team projects for a user at login time.
   *
   * For each CSTAR tenant the user belongs to:
   * 1. Fetches the user's shared service roles for that tenant
   * 2. Determines the highest applicable n8n project role (editor > viewer)
   * 3. Creates the team project if it doesn't exist yet
   * 4. Adds/updates/removes the user's project relation based on current CSTAR roles
   */
  async syncTenantsForUser(params: SyncTenantsForUserParams): Promise<void> {
    if (!IS_TENANT_PROJECT_SYNC_ENABLED) {
      log.debug('Tenant project sync disabled via IS_TENANT_PROJECT_SYNC_ENABLED=false');
      return;
    }

    if (!this.cstarService.isConfigured()) {
      log.debug('CSTAR not configured, skipping tenant project sync');
      return;
    }

    const { ssoUserId, n8nUserId, accessToken } = params;
    log.debug('Starting tenant project sync', { ssoUserId, n8nUserId });

    const tenants = await this.cstarService.getUserTenants({ ssoUserId, accessToken });
    if (tenants.length === 0) {
      log.debug('No CSTAR tenants for user, skipping sync', { ssoUserId });
      return;
    }

    log.debug('Found CSTAR tenants for user', {
      ssoUserId,
      tenantCount: tenants.length,
      tenantNames: tenants.map((t) => t.name),
    });

    for (const tenant of tenants) {
      await this.syncTenantForUser(tenant.id, tenant.name, n8nUserId, ssoUserId, accessToken);
    }

    log.debug('Tenant project sync completed', { ssoUserId, n8nUserId });
  }

  private async syncTenantForUser(
    tenantId: string,
    tenantName: string,
    n8nUserId: string,
    ssoUserId: string,
    accessToken: string,
  ): Promise<void> {
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
    const existingProjectIds = await this.customRepositories.tenantProjectRelation.getProjectIdsByTenantId(tenantId);

    if (existingProjectIds.length > 0) {
      // Project exists — sync the user's relation (add/update/remove)
      await this.syncUserProjectRelation(n8nUserId, existingProjectIds[0], resolvedRole, tenantId);
    } else if (resolvedRole) {
      // Project does NOT exist and user HAS a qualifying role — create it
      const projectId = await this.createTenantProject(tenantId, tenantName);
      if (projectId) {
        await this.syncUserProjectRelation(n8nUserId, projectId, resolvedRole, tenantId);
      }
    } else {
      // Project does NOT exist and user has NO qualifying role — skip
      log.debug('Skipping tenant project creation — user has no qualifying role', { tenantId, tenantName, n8nUserId });
    }
  }

  private resolveProjectRole(roleNames: string[]): ManagedProjectRole | null {
    if (roleNames.includes(PROJECT_ROLE_EDITOR)) {
      return PROJECT_ROLE_EDITOR;
    }
    if (roleNames.includes(PROJECT_ROLE_VIEWER)) {
      return PROJECT_ROLE_VIEWER;
    }
    return null;
  }

  /**
   * Creates a new team project for a tenant.
   * Returns the project ID, or null if creation failed.
   */
  private async createTenantProject(tenantId: string, tenantName: string): Promise<string | null> {
    log.debug('Creating new team project for tenant', { tenantId, tenantName, creatorId: this.globalOwnerUserId });

    // Create a new team project owned by the global owner
    const projectEntity = this.n8nRepositories.project.create({
      name: tenantName,
      type: 'team',
      creatorId: this.globalOwnerUserId,
    });

    const savedProject = await this.n8nRepositories.project.save(projectEntity);
    log.debug('Team project created', { tenantId, tenantName, projectId: savedProject.id });

    // Link the global owner as project:admin
    await this.n8nRepositories.projectRelation.save({
      projectId: savedProject.id,
      userId: this.globalOwnerUserId,
      role: { slug: PROJECT_ROLE_ADMIN },
    });
    log.debug('Global owner linked as project:admin', { projectId: savedProject.id, userId: this.globalOwnerUserId });

    // Map tenant to project
    await this.customRepositories.tenantProjectRelation.insert({
      tenantId,
      projectId: savedProject.id,
    });

    log.info('Created team project for tenant', {
      tenantId,
      tenantName,
      projectId: savedProject.id,
    });

    return savedProject.id;
  }

  /**
   * Syncs a user's relation to a tenant project.
   * - Adds or updates the relation if the user has an allowed role
   * - Removes the relation if the user no longer has an allowed role
   */
  private async syncUserProjectRelation(
    n8nUserId: string,
    projectId: string,
    resolvedRole: ManagedProjectRole | null,
    tenantId: string,
  ): Promise<void> {
    const existingRelation = (await this.n8nRepositories.projectRelation.findProjectRole({
      userId: n8nUserId,
      projectId,
    })) as { role?: { slug?: string } } | null;

    const currentRoleSlug = existingRelation?.role?.slug ?? null;
    log.debug('Current user project relation', { n8nUserId, projectId, currentRoleSlug, resolvedRole, tenantId });

    // Skip if this user is the global owner (project:admin) — don't modify their relation
    if (currentRoleSlug === PROJECT_ROLE_ADMIN && n8nUserId === this.globalOwnerUserId) {
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
      } else if (currentRoleSlug !== resolvedRole && isManagedProjectRole(currentRoleSlug)) {
        // Update existing relation (only if the current role is one we manage)
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
    } else if (currentRoleSlug && isManagedProjectRole(currentRoleSlug)) {
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
