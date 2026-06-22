import { createLogger } from '../utils/logger';
import { CSTAR_API_BASE_URL } from '@config';
import type {
  CstarTenant,
  CstarUserTenantsResponse,
  CstarSharedServiceRole,
  CstarUserSharedServiceRolesResponse,
  CstarUserGroup,
  CstarUserGroupsResponse,
} from '../types/cstar';

const log = createLogger('CstarService');

export type GetUserTenantsParams = {
  ssoUserId: string;
  accessToken: string;
  expand?: string;
};

export type GetUserSharedServiceRolesParams = {
  tenantId: string;
  ssoUserId: string;
  accessToken: string;
};

export type GetUserGroupsWithRolesParams = {
  tenantId: string;
  ssoUserId: string;
  accessToken: string;
};

export class CstarService {
  private readonly apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = CSTAR_API_BASE_URL;
  }

  /**
   * Returns true if CSTAR is configured (CSTAR_BASE_URL is set).
   */
  isConfigured(): boolean {
    return this.apiBaseUrl.length > 0;
  }

  /**
   * Fetches tenants for a user from the CSTAR API.
   * GET /users/{ssoUserId}/tenants[?expand=tenantUserRoles]
   */
  async getUserTenants(params: GetUserTenantsParams): Promise<CstarTenant[]> {
    if (!this.apiBaseUrl) {
      log.warn('CSTAR_BASE_URL is not configured, skipping tenant fetch');
      return [];
    }

    const { ssoUserId, accessToken, expand } = params;
    const url = new URL(`${this.apiBaseUrl}/users/${encodeURIComponent(ssoUserId)}/tenants`);
    if (expand) {
      url.searchParams.set('expand', expand);
    }

    const body = await this.fetchJson<CstarUserTenantsResponse>(url.toString(), accessToken, 'getUserTenants');
    return body?.data?.tenants ?? [];
  }

  /**
   * Fetches shared service roles assigned to a user within a specific tenant.
   * GET /tenants/{tenantId}/ssousers/{ssoUserId}/shared-service-roles
   */
  async getUserSharedServiceRoles(params: GetUserSharedServiceRolesParams): Promise<CstarSharedServiceRole[]> {
    if (!this.apiBaseUrl) {
      return [];
    }

    const { tenantId, ssoUserId, accessToken } = params;
    const url = `${this.apiBaseUrl}/tenants/${encodeURIComponent(tenantId)}/ssousers/${encodeURIComponent(ssoUserId)}/shared-service-roles`;

    const body = await this.fetchJson<CstarUserSharedServiceRolesResponse>(
      url,
      accessToken,
      'getUserSharedServiceRoles',
    );
    return body?.data?.sharedServiceRoles ?? [];
  }

  /**
   * Fetches groups (with their shared service roles) for a user within a tenant.
   * GET /tenants/{tenantId}/users/{ssoUserId}/groups/shared-service-roles
   */
  async getUserGroupsWithRoles(params: GetUserGroupsWithRolesParams): Promise<CstarUserGroup[]> {
    if (!this.apiBaseUrl) {
      return [];
    }

    const { tenantId, ssoUserId, accessToken } = params;
    const url = `${this.apiBaseUrl}/tenants/${encodeURIComponent(tenantId)}/users/${encodeURIComponent(ssoUserId)}/groups/shared-service-roles`;

    const body = await this.fetchJson<CstarUserGroupsResponse>(url, accessToken, 'getUserGroupsWithRoles');
    return body?.data?.groups ?? [];
  }

  /**
   * Shared fetch helper. Returns parsed JSON on success, null on any failure.
   */
  private async fetchJson<T>(url: string, accessToken: string, operation: string): Promise<T | null> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
    } catch (err) {
      log.error(`CSTAR ${operation} network error`, { error: String(err) });
      return null;
    }

    if (response.status === 401 || response.status === 403) {
      log.warn(`CSTAR ${operation} auth error`, { status: response.status });
      return null;
    }

    if (!response.ok) {
      log.error(`CSTAR ${operation} returned non-OK status`, { status: response.status });
      return null;
    }

    try {
      return (await response.json()) as T;
    } catch (err) {
      log.error(`CSTAR ${operation} response parse error`, { error: String(err) });
      return null;
    }
  }
}
