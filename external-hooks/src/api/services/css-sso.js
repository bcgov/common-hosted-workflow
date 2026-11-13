'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.CssSsoService = void 0;
const axios_1 = __importDefault(require('axios'));
const logger_1 = require('../utils/logger');
const url_1 = require('../utils/url');
const log = (0, logger_1.createLogger)('CssSsoService');
const REQUIRED_ROLES = ['global:owner', 'global:admin', 'global:member'];
class CssSsoService {
  config;
  cachedToken = null;
  client;
  constructor(config) {
    this.config = config;
    this.client = axios_1.default.create({
      baseURL: config.baseUrl,
      headers: { Accept: 'application/json' },
    });
  }
  async ensureRequiredRoles() {
    const path = `/integrations/${(0, url_1.buildPath)(this.config.integrationId, this.config.environment, 'roles')}`;
    const existing = await this.apiGet(path);
    const existingNames = new Set(existing.data.map((r) => r.name));
    for (const roleName of REQUIRED_ROLES) {
      if (existingNames.has(roleName)) continue;
      log.info('Creating missing CSS SSO role', { roleName });
      await this.apiPost(path, { name: roleName });
    }
  }
  async lookupAzureIdirUser(email) {
    const path = `/${(0, url_1.buildPath)(this.config.environment, 'azure-idir', 'users')}`;
    const response = await this.apiGet(path, { email });
    const candidates = response.data.filter(
      (u) => u.attributes.idir_user_guid && u.attributes.idir_user_guid.length > 0,
    );
    if (candidates.length === 0) {
      throw new Error(`No Azure IDIR user found with email ${email} (or user has no IDIR GUID)`);
    }
    return { username: candidates[0].username };
  }
  async assignUserRole(username, roleName) {
    const path = `/integrations/${(0, url_1.buildPath)(this.config.integrationId, this.config.environment, 'users', username, 'roles')}`;
    await this.apiPost(path, [{ name: roleName }]);
  }
  async getAccessToken() {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }
    try {
      const response = await axios_1.default.post(
        this.config.tokenEndpoint,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );
      this.cachedToken = {
        token: response.data.access_token,
        expiresAt: Date.now() + (response.data.expires_in - 60) * 1000,
      };
      return this.cachedToken.token;
    } catch (err) {
      const detail =
        axios_1.default.isAxiosError(err) && err.response
          ? `(${err.response.status}): ${err.response.data}`
          : String(err);
      throw new Error(`CSS SSO token request failed ${detail}`, { cause: err });
    }
  }
  async apiGet(path, queryParams) {
    const token = await this.getAccessToken();
    try {
      const response = await this.client.get(path, {
        headers: { Authorization: `Bearer ${token}` },
        params: queryParams,
      });
      return response.data;
    } catch (err) {
      const detail =
        axios_1.default.isAxiosError(err) && err.response
          ? `(${err.response.status}): ${JSON.stringify(err.response.data)}`
          : String(err);
      throw new Error(`CSS SSO GET ${path} failed ${detail}`, { cause: err });
    }
  }
  async apiPost(path, body) {
    const token = await this.getAccessToken();
    try {
      const response = await this.client.post(path, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (err) {
      const detail =
        axios_1.default.isAxiosError(err) && err.response
          ? `(${err.response.status}): ${err.response.data}`
          : String(err);
      throw new Error(`CSS SSO POST ${path} failed ${detail}`, { cause: err });
    }
  }
}
exports.CssSsoService = CssSsoService;
