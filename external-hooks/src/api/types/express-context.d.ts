import type { User } from './user';

declare global {
  namespace Express {
    interface Locals {
      caller?: User;
      chwfTenantId?: string;
      chwfAllowedProjectIds?: string[];
      chwfInternal?: boolean;
    }
  }
}

export {};
