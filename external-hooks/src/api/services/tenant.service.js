"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantService = void 0;
const tenant_roles_1 = require("../helpers/tenant-roles");
const tenant_groups_1 = require("../helpers/tenant-groups");
const ui_oidc_store_1 = require("../helpers/ui-oidc-store");
const ui_auth_token_1 = require("../helpers/ui-auth-token");
const errors_1 = require("../utils/errors");
const logger_1 = require("../utils/logger");
const log = (0, logger_1.createLogger)('TenantService');
class TenantService {
    customRepositories;
    n8nRepositories;
    cstarService;
    constructor(customRepositories, n8nRepositories, cstarService) {
        this.customRepositories = customRepositories;
        this.n8nRepositories = n8nRepositories;
        this.cstarService = cstarService;
    }
    /**
     * Returns combined tenant list for the user:
     * 1. CSTAR tenants (from external API, using user's OIDC token)
     * 2. Personal project (from n8n, represented as a pseudo-tenant)
     *
     * If CSTAR is unreachable or returns no tenants, only the personal project is returned.
     */
    async listTenantsForUser(params) {
        const { ssoUserId, accessToken, n8nUserId } = params;
        const tenants = [];
        // Fetch CSTAR tenants (graceful fallback on failure)
        if (accessToken && this.cstarService.isConfigured()) {
            const cstarTenants = await this.cstarService.getUserTenants({
                ssoUserId,
                accessToken,
            });
            for (const ct of cstarTenants) {
                tenants.push({
                    id: ct.id,
                    name: ct.name,
                    source: 'cstar',
                });
            }
        }
        // Add personal project as a pseudo-tenant
        if (n8nUserId) {
            const personalProject = await this.n8nRepositories.project.getPersonalProjectForUser(n8nUserId);
            if (personalProject) {
                const tenantId = await this.customRepositories.tenantProjectRelation.getTenantIdByProjectId(personalProject.id);
                if (tenantId) {
                    tenants.push({
                        id: tenantId,
                        name: 'My Personal Project',
                        source: 'personal',
                        projectId: personalProject.id,
                    });
                }
            }
        }
        return tenants;
    }
    /**
     * Legacy method — returns tenants from DB only.
     * @deprecated Use listTenantsForUser instead.
     */
    async listTenants() {
        const tenantIds = await this.customRepositories.tenantProjectRelation.listDistinctTenantIds();
        const source = 'cstar';
        return tenantIds.map((id, index) => ({
            id,
            name: `Tenant ${index + 1}`,
            source,
        }));
    }
    /**
     * Combined tenant roles+groups operation (single cache-aside, single CSTAR batch).
     * On cache hit for both, zero CSTAR calls. On either miss, one fetchAndCache call
     * populates both caches. This avoids duplicated orchestration when ui-api previously
     * called getTenantRolesForSession + getTenantGroupsForSession sequentially (2 Redis
     * GETs each + conditional extra CSTAR if second still missed).
     * Callers that need only one slice can still use the convenience wrappers below,
     * which delegate to this combined operation.
     */
    async getTenantRolesAndGroupsForSession(params) {
        if (!this.cstarService.isConfigured()) {
            return { roles: [], groups: [] };
        }
        const [cachedRoles, cachedGroups] = await Promise.all([
            (0, ui_oidc_store_1.getUiTenantRoles)(params.email),
            (0, ui_oidc_store_1.getUiTenantGroups)(params.email),
        ]);
        if (cachedRoles && cachedGroups) {
            return { roles: cachedRoles, groups: cachedGroups };
        }
        const { roles, groups, refreshedToken } = await this.fetchAndCacheRolesAndGroups(params);
        return { roles, groups, refreshedToken };
    }
    /**
     * Resolves tenant roles for a user session (cache-aside pattern).
     * Returns cached value from Redis if available, otherwise fetches from CSTAR.
     * On cache miss, fetches both roles and groups in a single CSTAR call and populates both caches.
     * Preserves single-cache read for single-slice callers; combined callers should use
     * getTenantRolesAndGroupsForSession to avoid sequential GETs.
     */
    async getTenantRolesForSession(params) {
        if (!this.cstarService.isConfigured()) {
            return { roles: [] };
        }
        const cached = await (0, ui_oidc_store_1.getUiTenantRoles)(params.email);
        if (cached) {
            return { roles: cached };
        }
        const { roles, refreshedToken } = await this.fetchAndCacheRolesAndGroups(params);
        return { roles, refreshedToken };
    }
    /**
     * Resolves tenant groups for a user session (cache-aside pattern).
     * Returns cached value from Redis if available, otherwise fetches from CSTAR.
     * On cache miss, fetches both roles and groups in a single CSTAR call and populates both caches.
     * Preserves single-cache read for single-slice callers; combined callers should use
     * getTenantRolesAndGroupsForSession to avoid sequential GETs.
     */
    async getTenantGroupsForSession(params) {
        if (!this.cstarService.isConfigured()) {
            return { groups: [] };
        }
        const cached = await (0, ui_oidc_store_1.getUiTenantGroups)(params.email);
        if (cached) {
            return { groups: cached };
        }
        const { groups, refreshedToken } = await this.fetchAndCacheRolesAndGroups(params);
        return { groups, refreshedToken };
    }
    /**
     * Fetches roles and groups from CSTAR in a single pass and stores both in Redis.
     * Called on cache miss from either getTenantRolesForSession or getTenantGroupsForSession.
     */
    async fetchAndCacheRolesAndGroups(params) {
        let token = params.accessToken ?? (await (0, ui_oidc_store_1.getUiOidcAccessTokenByEmail)(params.email));
        if (!token) {
            log.debug('No access token available for tenant roles/groups fetch', { email: params.email });
            return { roles: [], groups: [] };
        }
        let refreshedToken;
        const tokenRecord = await (0, ui_oidc_store_1.getUiOidcAccessTokenRecord)(token);
        if (tokenRecord?.expiresAt && (0, ui_auth_token_1.shouldRefreshAccessToken)(tokenRecord.expiresAt) && params.refreshAccessToken) {
            const refreshResult = await params.refreshAccessToken();
            if (refreshResult) {
                token = refreshResult.accessToken;
                refreshedToken = refreshResult.refreshedToken;
            }
            else {
                throw new errors_1.AppError(401, 'Session expired');
            }
        }
        const { roles, groups } = await this.fetchTenantRolesAndGroupsFromCstar(params.ssoUserId, token);
        // Populate both caches (even if empty, to avoid repeated upstream calls)
        await Promise.all([(0, ui_oidc_store_1.setUiTenantRoles)(params.email, roles), (0, ui_oidc_store_1.setUiTenantGroups)(params.email, groups)]);
        return { roles, groups, refreshedToken };
    }
    /**
     * Pre-warms both tenant roles and tenant groups cache at login time.
     * Uses a single CSTAR call (getUserGroupsWithRoles) per tenant to derive both.
     * Throws on failure — caller is responsible for error handling.
     * Accepts optional pre-fetched tenants to avoid a duplicate CSTAR tenants call
     * when the caller already holds the tenant list (e.g., post-login work reuses
     * the same tenants for sync and pre-warm).
     */
    async prewarmTenantRolesAndGroups(params) {
        if (!this.cstarService.isConfigured()) {
            return {};
        }
        const { roles, groups } = await this.fetchTenantRolesAndGroupsFromCstar(params.ssoUserId, params.accessToken, params.tenants);
        await Promise.all([(0, ui_oidc_store_1.setUiTenantRoles)(params.email, roles), (0, ui_oidc_store_1.setUiTenantGroups)(params.email, groups)]);
        return {};
    }
    /**
     * @deprecated Use prewarmTenantRolesAndGroups instead.
     */
    async prewarmTenantRoles(params) {
        await this.prewarmTenantRolesAndGroups(params);
    }
    /**
     * Invalidates the cached tenant roles and groups for a user (e.g. on token refresh).
     */
    async invalidateTenantRolesAndGroups(email) {
        await Promise.all([(0, tenant_roles_1.invalidateTenantRoles)(email), (0, tenant_groups_1.invalidateTenantGroups)(email)]);
    }
    /**
     * @deprecated Use invalidateTenantRolesAndGroups instead.
     */
    async invalidateTenantRoles(email) {
        return this.invalidateTenantRolesAndGroups(email);
    }
    /**
     * Fetches groups with roles from CSTAR for all tenants and returns both
     * TenantRole[] and TenantGroup[] derived from a single getUserGroupsWithRoles call per tenant.
     */
    async fetchTenantRolesAndGroupsFromCstar(ssoUserId, accessToken, preFetchedTenants) {
        const tenants = preFetchedTenants ?? (await this.cstarService.getUserTenants({ ssoUserId, accessToken }));
        if (tenants.length === 0) {
            return { roles: [], groups: [] };
        }
        const results = await Promise.allSettled(tenants.map(async (tenant) => {
            const userGroups = await this.cstarService.getUserGroupsWithRoles({
                tenantId: tenant.id,
                ssoUserId,
                accessToken,
            });
            // Extract unique role names from all groups' sharedServiceRoles
            const roleNameSet = new Set();
            for (const group of userGroups) {
                for (const role of group.sharedServiceRoles) {
                    roleNameSet.add(role.name);
                }
            }
            return {
                tenantId: tenant.id,
                tenantName: tenant.name,
                roleNames: [...roleNameSet],
                groupNames: userGroups.map((g) => g.name),
            };
        }));
        const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
        const rejected = results.filter((r) => r.status === 'rejected');
        if (rejected.length > 0) {
            log.warn('Some tenant roles/groups fetches failed', {
                ssoUserId,
                failedCount: rejected.length,
                totalCount: tenants.length,
            });
        }
        const roles = fulfilled.map((f) => ({
            tenantId: f.tenantId,
            tenantName: f.tenantName,
            roles: f.roleNames,
        }));
        const groups = fulfilled.map((f) => ({
            tenantId: f.tenantId,
            tenantName: f.tenantName,
            groups: f.groupNames,
        }));
        return { roles, groups };
    }
    async fetchTenantRolesFromCstar(ssoUserId, accessToken) {
        const { roles } = await this.fetchTenantRolesAndGroupsFromCstar(ssoUserId, accessToken);
        return roles;
    }
    async fetchTenantGroupsFromCstar(ssoUserId, accessToken) {
        const { groups } = await this.fetchTenantRolesAndGroupsFromCstar(ssoUserId, accessToken);
        return groups;
    }
}
exports.TenantService = TenantService;
