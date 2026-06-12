import { createLogger } from '../utils/logger';

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

  constructor(private readonly config: CssSsoConfig) {}

  async ensureRequiredRoles(): Promise<void> {
    const path = `/integrations/${this.config.integrationId}/${this.config.environment}/roles`;
    const existing = await this.apiGet<{ data: RoleResponse[] }>(path);
    const existingNames = new Set(existing.data.map((r) => r.name));

    for (const roleName of REQUIRED_ROLES) {
      if (existingNames.has(roleName)) continue;

      log.info('Creating missing CSS SSO role', { roleName });
      await this.apiPost(path, { name: roleName });
    }
  }

  async lookupAzureIdirUser(email: string): Promise<{ username: string }> {
    const path = `/${this.config.environment}/azure-idir/users?email=${encodeURIComponent(email)}`;
    const response = await this.apiGet<{ data: AzureIdirUser[] }>(path);

    const candidates = response.data.filter(
      (u) => u.attributes.idir_user_guid && u.attributes.idir_user_guid.length > 0,
    );

    if (candidates.length === 0) {
      throw new Error(`No Azure IDIR user found with email ${email} (or user has no IDIR GUID)`);
    }

    return { username: candidates[0].username };
  }

  async assignUserRole(username: string, roleName: string): Promise<void> {
    const path = `/integrations/${this.config.integrationId}/${this.config.environment}/users/${encodeURIComponent(username)}/roles`;
    await this.apiPost(path, [{ name: roleName }]);
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`CSS SSO token request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };

    return this.cachedToken.token;
  }

  private async apiGet<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`CSS SSO GET ${path} failed (${response.status}): ${body}`);
    }

    return (await response.json()) as T;
  }

  private async apiPost<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CSS SSO POST ${path} failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }
}
