import axios, { type AxiosInstance } from 'axios';
import { createLogger } from '../utils/logger';
import { buildPath } from '../utils/url';
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
  private readonly client: AxiosInstance | null;

  constructor() {
    if (CSTAR_API_BASE_URL) {
      this.client = axios.create({
        baseURL: CSTAR_API_BASE_URL,
        headers: { Accept: 'application/json' },
      });
    } else {
      this.client = null;
    }
  }

  /**
   * Returns true if CSTAR is configured (CSTAR_BASE_URL is set).
   */
  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Fetches tenants for a user from the CSTAR API.
   * GET /users/{ssoUserId}/tenants[?expand=tenantUserRoles]
   */
  async getUserTenants(params: GetUserTenantsParams): Promise<CstarTenant[]> {
    const { ssoUserId, accessToken, expand } = params;
    const queryParams = expand ? { expand } : undefined;

    const body = await this.fetchJson<CstarUserTenantsResponse>(
      buildPath('users', ssoUserId, 'tenants'),
      accessToken,
      'getUserTenants',
      queryParams,
    );
    return body?.data?.tenants ?? [];
  }

  /**
   * Fetches shared service roles assigned to a user within a specific tenant.
   * GET /tenants/{tenantId}/ssousers/{ssoUserId}/shared-service-roles
   */
  async getUserSharedServiceRoles(params: GetUserSharedServiceRolesParams): Promise<CstarSharedServiceRole[]> {
    const { tenantId, ssoUserId, accessToken } = params;

    const body = await this.fetchJson<CstarUserSharedServiceRolesResponse>(
      buildPath('tenants', tenantId, 'ssousers', ssoUserId, 'shared-service-roles'),
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
    const { tenantId, ssoUserId, accessToken } = params;

    const body = await this.fetchJson<CstarUserGroupsResponse>(
      buildPath('tenants', tenantId, 'users', ssoUserId, 'groups', 'shared-service-roles'),
      accessToken,
      'getUserGroupsWithRoles',
    );
    return body?.data?.groups ?? [];
  }

  /**
   * Centralized GET request helper.
   * - Accepts a pre-built path (use `buildPath()` to encode segments)
   * - Attaches the Bearer token
   * - Returns parsed JSON on success, null on any failure
   */
  private async fetchJson<T>(
    path: string,
    accessToken: string,
    operation: string,
    queryParams?: Record<string, string>,
  ): Promise<T | null> {
    if (!this.client) {
      log.warn(`CSTAR not configured, skipping ${operation}`);
      return null;
    }

    try {
      const response = await this.client.get<T>(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: queryParams,
      });
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        const status = err.response.status;
        if (status === 401 || status === 403) {
          log.warn(`CSTAR ${operation} auth error`, { status });
        } else {
          log.error(`CSTAR ${operation} returned non-OK status`, { status });
        }
      } else {
        log.error(`CSTAR ${operation} network error`, { error: String(err) });
      }
      return null;
    }
  }
}
