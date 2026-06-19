import type { User } from './user';
import type { OidcTokenDetails } from './oidc';
import type { UiResolvedSession } from '../helpers/ui-oidc';
import type { UiApiContext } from './ui-api';

declare global {
  namespace Express {
    interface Request {
      session?: UiResolvedSession;
      context?: UiApiContext;
    }

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
