import type { CustomRepositories } from '../bootstrap/custom-repositories';
import type { N8nRepositories } from '../bootstrap/n8n-repositories';
import type { TenantService } from './tenant.service';
import type { CstarService } from './cstar.service';
import { AppError } from '../utils/errors';

export type AdminProjectItem = {
  projectId: string;
  projectName: string;
  projectType: string;
  tenantId: string | null;
};

export type AdminProjectsPage = {
  data: AdminProjectItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type UserProjectTenantItem = {
  tenantId: string;
  tenantName: string;
  projectId: string | null;
};

export class ProjectTenantService {
  constructor(
    private readonly n8nRepositories: N8nRepositories,
    private readonly customRepositories: CustomRepositories,
    private readonly tenantService: TenantService,
    private readonly cstarService: CstarService,
  ) {}

  /**
   * Lists all n8n projects with their tenant mappings, paginated.
   * Merges project data from n8n with tenant-project relations from the custom DB.
   */
  async listAllProjectsWithTenants(page: number, pageSize: number): Promise<AdminProjectsPage> {
    const { projects, totalCount } = await this.n8nRepositories.project.listPaginated(page, pageSize);
    const tenantMap = await this.customRepositories.tenantProjectRelation.listAll();

    const data: AdminProjectItem[] = projects.map((p) => ({
      projectId: p.id,
      projectName: p.name,
      projectType: p.type,
      tenantId: tenantMap.get(p.id) ?? null,
    }));

    return {
      data,
      pagination: {
        page,
        pageSize,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  /**
   * Assigns a tenant ID to a project. Validates that the project exists and that
   * the tenant is not already assigned to a different project.
   * Throws AppError 404 if project not found, 409 if tenant conflict.
   */
  async assignTenantToProject(projectId: string, tenantId: string): Promise<void> {
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (!project) {
      throw new AppError(404, 'Project not found');
    }

    // Check if the tenantId is already assigned to a different project
    const tenantMap = await this.customRepositories.tenantProjectRelation.listAll();
    for (const [existingProjectId, existingTenantId] of tenantMap) {
      if (existingTenantId === tenantId && existingProjectId !== projectId) {
        throw new AppError(409, 'Tenant ID is already assigned to another project', {
          conflictProjectId: existingProjectId,
        });
      }
    }

    await this.customRepositories.tenantProjectRelation.upsertByProjectId({ tenantId, projectId });
  }

  /**
   * Removes the tenant mapping from a project.
   * Throws AppError 404 if the project does not exist.
   */
  async removeTenantFromProject(projectId: string): Promise<void> {
    const project = await this.n8nRepositories.project.findOneBy({ id: projectId });
    if (!project) {
      throw new AppError(404, 'Project not found');
    }

    await this.customRepositories.tenantProjectRelation.deleteByProjectId(projectId);
  }

  /**
   * Lists the authenticated user's CSTAR tenants with their associated project IDs.
   * Uses the CstarService to fetch tenants, then maps each to its project via the relation table.
   * Returns an empty list gracefully if the user does not exist in CSTAR or has no tenants/projects.
   */
  async listUserProjectTenants(params: {
    ssoUserId: string;
    n8nUserId: string;
    accessToken: string;
  }): Promise<UserProjectTenantItem[]> {
    const { ssoUserId, n8nUserId, accessToken } = params;
    const results: UserProjectTenantItem[] = [];

    // Fetch CSTAR tenants for the user
    if (this.cstarService.isConfigured()) {
      const cstarTenants = await this.cstarService.getUserTenants({ ssoUserId, accessToken });
      const tenantMap = await this.customRepositories.tenantProjectRelation.listAll();

      // Build a reverse map: tenantId → projectId
      const tenantToProject = new Map<string, string>();
      for (const [projectId, tenantId] of tenantMap) {
        tenantToProject.set(tenantId, projectId);
      }

      for (const tenant of cstarTenants) {
        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          projectId: tenantToProject.get(tenant.id) ?? null,
        });
      }
    }

    // Include the user's personal project if it has a tenant mapping
    const personalItem = await this.resolvePersonalProjectTenant(n8nUserId);
    if (personalItem && !results.some((r) => r.tenantId === personalItem.tenantId)) {
      results.push(personalItem);
    }

    return results;
  }

  /**
   * Resolves the personal project tenant mapping for a user.
   * Returns null gracefully if the user has no n8n user ID, no personal project, or no tenant mapping.
   */
  private async resolvePersonalProjectTenant(n8nUserId: string): Promise<UserProjectTenantItem | null> {
    if (!n8nUserId) {
      return null;
    }

    try {
      const personalProject = await this.n8nRepositories.project.getPersonalProjectForUser(n8nUserId);
      if (!personalProject) {
        return null;
      }

      const personalTenantId = await this.customRepositories.tenantProjectRelation.getTenantIdByProjectId(
        personalProject.id,
      );
      if (!personalTenantId) {
        return null;
      }

      return {
        tenantId: personalTenantId,
        tenantName: 'My Personal Project',
        projectId: personalProject.id,
      };
    } catch {
      // User may not have a personal project in n8n — gracefully return null
      return null;
    }
  }
}
