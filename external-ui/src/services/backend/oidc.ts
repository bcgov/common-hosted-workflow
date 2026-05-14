import { instance } from './axios';

export interface OidcRuntimeConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string;
}

const defaultOidcRuntimeConfig: OidcRuntimeConfig = {
  issuer: 'http://localhost:8080/realms/starter',
  clientId: 'external-ui',
  redirectUri: `${window.location.origin}/ui/auth/callback`,
  postLogoutRedirectUri: `${window.location.origin}/ui/`,
  scopes: 'openid email profile',
};

let runtimeConfig = defaultOidcRuntimeConfig;
let runtimeConfigPromise: Promise<OidcRuntimeConfig> | null = null;

export async function loadOidcRuntimeConfig(): Promise<OidcRuntimeConfig> {
  if (!runtimeConfigPromise) {
    const configPromise = instance
      .get<Partial<OidcRuntimeConfig>>('/ui-api/runtime-config')
      .then((response) => {
        const config = response.data;

        runtimeConfig = {
          issuer: config.issuer ?? defaultOidcRuntimeConfig.issuer,
          clientId: config.clientId ?? defaultOidcRuntimeConfig.clientId,
          redirectUri: config.redirectUri ?? defaultOidcRuntimeConfig.redirectUri,
          postLogoutRedirectUri: config.postLogoutRedirectUri ?? defaultOidcRuntimeConfig.postLogoutRedirectUri,
          scopes: config.scopes ?? defaultOidcRuntimeConfig.scopes,
        };

        return runtimeConfig;
      })
      .catch(() => defaultOidcRuntimeConfig)
      .finally(() => {
        runtimeConfigPromise = null;
      });

    runtimeConfigPromise = configPromise;
  }

  return runtimeConfigPromise!;
}

export function getOidcRuntimeConfig() {
  return runtimeConfig;
}
