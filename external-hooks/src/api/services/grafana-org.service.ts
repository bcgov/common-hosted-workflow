import { createRemoteJWKSet, jwtVerify } from 'jose';
import { OIDC_ISSUER, OIDC_JWKS_URI, OIDC_ROLES_CLAIM } from '@config';
import { extractBearerToken } from '../helpers/bearer';
import { getGrafanaProjectsCache, setGrafanaProjectsCache } from '../helpers/ui-oidc-store';
import type { CstarService } from './cstar.service';
import type { TenantProjectRelationRepository } from '../../db/repository/custom/tenant-project-relation';
import type { ProjectRepository } from '../../db/repository/n8n/project';
import type { UserRepository } from '../../db/repository/n8n/user';
import { createLogger } from '../utils/logger';

const log = createLogger('GrafanaOrg');

const ADMIN_ROLES = new Set(['global:owner', 'global:admin']);

export class GrafanaOrgService {
  // JWKS set is created once and cached by jose internally (key rotation handled automatically).
  private remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(
    private readonly cstarService: CstarService,
    private readonly tenantProjectRelationRepo: TenantProjectRelationRepository,
    private readonly projectRepository: ProjectRepository,
    private readonly userRepository: UserRepository,
  ) {}

  private getJwks() {
    if (!this.remoteJwks && OIDC_JWKS_URI) {
      this.remoteJwks = createRemoteJWKSet(new URL(OIDC_JWKS_URI));
    }
    return this.remoteJwks;
  }

  /**
   * Resolves the list of projects the authenticated user can access, with human-readable names.
   *
   * - Admin JWT: all team projects + personal project, isAdmin=true
   * - Non-admin JWT: CSTAR tenant names mapped to project IDs + personal project from n8n DB
   * - CSTAR not configured: personal project only (team membership unresolvable without CSTAR)
   */
  async resolveProjects(
    authHeader: string | undefined,
  ): Promise<{ isAdmin: boolean; projects: Array<{ id: string; name: string }> }> {
    const token = extractBearerToken(authHeader);

    if (!token) {
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }

    const jwks = this.getJwks();
    if (!jwks) {
      return { isAdmin: false, projects: [] };
    }

    let ssoUserId: string;
    let email: string;
    let isAdmin: boolean;
    try {
      const { payload } = await jwtVerify(token, jwks, {
        ...(OIDC_ISSUER ? { issuer: OIDC_ISSUER } : {}),
      });
      ssoUserId = typeof payload.sub === 'string' ? payload.sub : '';
      email = typeof payload.email === 'string' ? payload.email : '';
      if (!ssoUserId) return { isAdmin: false, projects: [] };
      const rawRoles = payload[OIDC_ROLES_CLAIM];
      const roles = Array.isArray(rawRoles) ? (rawRoles as unknown[]) : [];
      isAdmin = roles.some((r) => ADMIN_ROLES.has(r as string));
    } catch (err) {
      log.warn('resolveProjects: JWT verification failed', { error: String(err) });
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }

    const cached = await getGrafanaProjectsCache(ssoUserId);
    if (cached) return cached;

    if (isAdmin) {
      // 500 is well above the realistic maximum for this deployment (one project per ministry/team).
      const { projects: teamProjects } = await this.projectRepository.listPaginated(1, 500, { type: 'team' });
      const projects: Array<{ id: string; name: string }> = teamProjects.map((p) => ({ id: p.id, name: p.name }));
      if (email) {
        try {
          const user = await this.userRepository.findByEmail(email);
          if (user) {
            const personalProject = await this.projectRepository.getPersonalProjectForUser(user.id);
            if (personalProject) {
              projects.push({ id: personalProject.id, name: 'My Personal Project' });
            }
          }
        } catch (err) {
          log.warn('resolveProjects admin personal project failed', { error: String(err) });
        }
      }
      const result = { isAdmin: true as const, projects };
      void setGrafanaProjectsCache(ssoUserId, result);
      return result;
    }

    // Non-admin: resolve project names from CSTAR tenant memberships.
    const projects: Array<{ id: string; name: string }> = [];

    if (this.cstarService.isConfigured()) {
      try {
        const [tenants, relationMap] = await Promise.all([
          this.cstarService.getUserTenants({ ssoUserId, accessToken: token }),
          this.tenantProjectRelationRepo.listAll(),
        ]);
        const tenantToProject = new Map<string, string>();
        for (const [projectId, tenantId] of relationMap) {
          tenantToProject.set(tenantId, projectId);
        }
        for (const tenant of tenants) {
          const projectId = tenantToProject.get(tenant.id);
          if (projectId) {
            projects.push({ id: projectId, name: tenant.name });
          }
        }
      } catch (err) {
        log.warn('resolveProjects: CSTAR lookup failed', { error: String(err) });
      }
    }

    // Personal project is always presented with a stable display name.
    if (email) {
      try {
        const user = await this.userRepository.findByEmail(email);
        if (user) {
          const personalProject = await this.projectRepository.getPersonalProjectForUser(user.id);
          if (personalProject && !projects.some((p) => p.id === personalProject.id)) {
            projects.push({ id: personalProject.id, name: 'My Personal Project' });
          }
        }
      } catch {
        // Non-fatal — skip personal project
      }
    }

    const result = { isAdmin: false as const, projects };
    void setGrafanaProjectsCache(ssoUserId, result);
    return result;
  }
}
