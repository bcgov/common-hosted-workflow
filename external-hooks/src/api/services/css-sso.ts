import axios, { type AxiosInstance } from 'axios';
import { createLogger } from '../utils/logger';
import { buildPath } from '../utils/url';
import { logger } from 'handlebars';

const log = createLogger('CssSsoService');

const REQUIRED_ROLES = ['global:owner', 'global:admin', 'global:member'] as const;

export type CssSsoConfig = {
  baseUrl: string;
  integrationId: string;
  environment: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type RoleResponse = {
  name: string;
  composite: boolean;
};

type AzureIdirUser = {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  attributes: {
    display_name?: string[];
    idir_user_guid?: string[];
    idir_username?: string[];
  };
};

export class CssSsoService {
  private cachedToken: { token: string; expiresAt: number } | null = null;
  private readonly client: AxiosInstance;

  constructor(private readonly config: CssSsoConfig) {
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: { Accept: 'application/json' },
    });
  }

  async ensureRequiredRoles(): Promise<void> {
    const path = `/integrations/${buildPath(this.config.integrationId, this.config.environment, 'roles')}`;
    const existing = await this.apiGet<{ data: RoleResponse[] }>(path);
    const existingNames = new Set(existing.data.map((r) => r.name));

    for (const roleName of REQUIRED_ROLES) {
      if (existingNames.has(roleName)) continue;

      log.info('Creating missing CSS SSO role', { roleName });
      await this.apiPost(path, { name: roleName });
    }
  }

  async lookupAzureIdirUser(email: string): Promise<{ username: string }> {
    const path = `/${buildPath(this.config.environment, 'azure-idir', 'users')}`;
    const response = await this.apiGet<{ data: AzureIdirUser[] }>(path, { email });

    const candidates = response.data.filter(
      (u) => u.attributes.idir_user_guid && u.attributes.idir_user_guid.length > 0,
    );

    if (candidates.length === 0) {
      throw new Error(`No Azure IDIR user found with email ${email} (or user has no IDIR GUID)`);
    }

    return { username: candidates[0].username };
  }

  async assignUserRole(username: string, roleName: string): Promise<void> {
    const path = `/integrations/${buildPath(this.config.integrationId, this.config.environment, 'users', username, 'roles')}`;
    await this.apiPost(path, [{ name: roleName }]);
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    try {
      const response = await axios.post<TokenResponse>(
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
        axios.isAxiosError(err) && err.response ? `(${err.response.status}): ${err.response.data}` : String(err);
      throw new Error(`CSS SSO token request failed ${detail}`, { cause: err });
    }
  }

  private async apiGet<T>(path: string, queryParams?: Record<string, string>): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await this.client.get<T>(path, {
        headers: { Authorization: `Bearer ${token}` },
        params: queryParams,
      });
      return response.data;
    } catch (err) {
      const detail =
        axios.isAxiosError(err) && err.response
          ? `(${err.response.status}): ${JSON.stringify(err.response.data)}`
          : String(err);
      throw new Error(`CSS SSO GET ${path} failed ${detail}`, { cause: err });
    }
  }

  private async apiPost<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();

    try {
      const response = await this.client.post<T>(path, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (err) {
      const detail =
        axios.isAxiosError(err) && err.response ? `(${err.response.status}): ${err.response.data}` : String(err);
      throw new Error(`CSS SSO POST ${path} failed ${detail}`, { cause: err });
    }
  }
}
