import type { User } from './user';
import type { OidcTokenDetails } from './oidc';

declare global {
  namespace Express {
    interface Locals {
      caller?: User;
      chwfTenantId?: string;
      chwfAllowedProjectIds?: string[];
      chwfInternal?: boolean;
      oidcToken?: string;
      oidcTokenDetails?: OidcTokenDetails;
    }
  }
}

export {};
