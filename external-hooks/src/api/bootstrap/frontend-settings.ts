import { READONLY_MODE } from '@config';
import { getN8nOidcConfigFromEnv, validateN8nOidcConfig } from '../helpers/n8n-oidc';
import { createLogger } from '../utils/logger';

const log = createLogger('CustomAPIs');

type FrontendSettingsOidc = {
  loginEnabled: boolean;
  loginUrl: string;
  callbackUrl: string;
};

type FrontendSettingsSso = Record<string, unknown> & {
  oidc?: FrontendSettingsOidc;
};

type FrontendSettingsUserManagement = Record<string, unknown> & {
  authenticationMethod?: string;
};

type FrontendSettingsEnterprise = Record<string, unknown> & {
  oidc?: boolean;
};

export type FrontendSettings = Record<string, unknown> & {
  sso?: FrontendSettingsSso;
  userManagement?: FrontendSettingsUserManagement;
  enterprise?: FrontendSettingsEnterprise;
};

/** Disables editor autosave in read-only mode to prevent repeated save failures and error toasts. */
export function applyReadOnlyFrontendSettings(frontendSettings: FrontendSettings, isReadOnly = READONLY_MODE) {
  if (!isReadOnly) {
    return;
  }

  frontendSettings.workflowsAutosaveDisabled = true;
}

export function applyOidcFrontendSettings(frontendSettings: FrontendSettings) {
  const config = getN8nOidcConfigFromEnv();
  const missing = validateN8nOidcConfig(config);
  if (missing.length > 0) {
    return;
  }

  frontendSettings.sso = frontendSettings.sso || {};
  frontendSettings.sso.oidc = {
    loginEnabled: true,
    loginUrl: '/rest/auth/oidc/login',
    callbackUrl: config.redirectUri,
  };

  frontendSettings.userManagement = frontendSettings.userManagement || {};
  frontendSettings.userManagement.authenticationMethod = 'oidc';

  frontendSettings.enterprise = frontendSettings.enterprise || {};
  frontendSettings.enterprise.oidc = true;

  log.info('Frontend settings configured for OIDC');
}
