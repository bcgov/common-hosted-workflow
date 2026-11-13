'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.CstarService = void 0;
const axios_1 = __importDefault(require('axios'));
const logger_1 = require('../utils/logger');
const url_1 = require('../utils/url');
const _config_1 = require('@config');
const log = (0, logger_1.createLogger)('CstarService');
class CstarService {
  client;
  constructor() {
    if (_config_1.CSTAR_API_BASE_URL) {
      this.client = axios_1.default.create({
        baseURL: _config_1.CSTAR_API_BASE_URL,
        headers: { Accept: 'application/json' },
      });
    } else {
      this.client = null;
    }
  }
  /**
   * Returns true if CSTAR is configured (CSTAR_BASE_URL is set).
   */
  isConfigured() {
    return this.client !== null;
  }
  /**
   * Fetches tenants for a user from the CSTAR API.
   * GET /users/{ssoUserId}/tenants[?expand=tenantUserRoles]
   */
  async getUserTenants(params) {
    const { ssoUserId, accessToken, expand } = params;
    const queryParams = expand ? { expand } : undefined;
    const body = await this.fetchJson(
      (0, url_1.buildPath)('users', ssoUserId, 'tenants'),
      accessToken,
      'getUserTenants',
      queryParams,
    );
    return body?.data?.tenants ?? [];
  }
  async getUserTenantsStrict(params) {
    const { ssoUserId, accessToken, expand } = params;
    const queryParams = expand ? { expand } : undefined;
    const body = await this.fetchJsonStrict(
      (0, url_1.buildPath)('users', ssoUserId, 'tenants'),
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
  async getUserSharedServiceRoles(params) {
    const { tenantId, ssoUserId, accessToken } = params;
    const body = await this.fetchJson(
      (0, url_1.buildPath)('tenants', tenantId, 'ssousers', ssoUserId, 'shared-service-roles'),
      accessToken,
      'getUserSharedServiceRoles',
    );
    return body?.data?.sharedServiceRoles ?? [];
  }
  async getUserSharedServiceRolesStrict(params) {
    const { tenantId, ssoUserId, accessToken } = params;
    const body = await this.fetchJsonStrict(
      (0, url_1.buildPath)('tenants', tenantId, 'ssousers', ssoUserId, 'shared-service-roles'),
      accessToken,
      'getUserSharedServiceRoles',
    );
    return body?.data?.sharedServiceRoles ?? [];
  }
  /**
   * Fetches groups (with their shared service roles) for a user within a tenant.
   * GET /tenants/{tenantId}/users/{ssoUserId}/groups/shared-service-roles
   */
  async getUserGroupsWithRoles(params) {
    const { tenantId, ssoUserId, accessToken } = params;
    const body = await this.fetchJson(
      (0, url_1.buildPath)('tenants', tenantId, 'users', ssoUserId, 'groups', 'shared-service-roles'),
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
  async fetchJson(path, accessToken, operation, queryParams) {
    if (!this.client) {
      log.warn(`CSTAR not configured, skipping ${operation}`);
      return null;
    }
    try {
      const response = await this.client.get(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: queryParams,
      });
      return response.data;
    } catch (err) {
      if (axios_1.default.isAxiosError(err) && err.response) {
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
  async fetchJsonStrict(path, accessToken, operation, queryParams) {
    if (!this.client) {
      throw new Error(`CSTAR not configured for ${operation}`);
    }
    try {
      const response = await this.client.get(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: queryParams,
      });
      return response.data;
    } catch (err) {
      const detail =
        axios_1.default.isAxiosError(err) && err.response ? `status ${err.response.status}` : `error ${String(err)}`;
      throw new Error(`CSTAR ${operation} failed (${detail})`, { cause: err });
    }
  }
}
exports.CstarService = CstarService;
