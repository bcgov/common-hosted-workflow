import {
  AUTHZ_SERVICE_URL,
  AUTHZ_INTEGRATION_ID,
  AUTHZ_ENVIRONMENT,
  AUTHZ_TOKEN_ENDPOINT,
  AUTHZ_CLIENT_ID,
  AUTHZ_CLIENT_SECRET,
} from '@config';
import type { CssSsoConfig } from './css-sso-client';

const REQUIRED_VALUES = [
  AUTHZ_SERVICE_URL,
  AUTHZ_INTEGRATION_ID,
  AUTHZ_ENVIRONMENT,
  AUTHZ_TOKEN_ENDPOINT,
  AUTHZ_CLIENT_ID,
  AUTHZ_CLIENT_SECRET,
];

export function getCssSsoConfig(): CssSsoConfig | null {
  if (REQUIRED_VALUES.some((v) => !v)) {
    return null;
  }

  return {
    baseUrl: AUTHZ_SERVICE_URL,
    integrationId: AUTHZ_INTEGRATION_ID,
    environment: AUTHZ_ENVIRONMENT,
    tokenEndpoint: AUTHZ_TOKEN_ENDPOINT,
    clientId: AUTHZ_CLIENT_ID,
    clientSecret: AUTHZ_CLIENT_SECRET,
  };
}
