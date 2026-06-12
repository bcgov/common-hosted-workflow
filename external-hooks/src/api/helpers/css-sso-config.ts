import type { CssSsoConfig } from './css-sso-client';

const REQUIRED_VARS = [
  'AUTHZ_SERVICE_URL',
  'AUTHZ_INTEGRATION_ID',
  'AUTHZ_ENVIRONMENT',
  'AUTHZ_TOKEN_ENDPOINT',
  'AUTHZ_CLIENT_ID',
  'AUTHZ_CLIENT_SECRET',
] as const;

export function getCssSsoConfig(): CssSsoConfig | null {
  const values = REQUIRED_VARS.map((key) => process.env[key] ?? '');

  if (values.some((v) => !v)) {
    return null;
  }

  return {
    baseUrl: values[0],
    integrationId: values[1],
    environment: values[2],
    tokenEndpoint: values[3],
    clientId: values[4],
    clientSecret: values[5],
  };
}
