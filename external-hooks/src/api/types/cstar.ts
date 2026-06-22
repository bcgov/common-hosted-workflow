/**
 * Types representing CSTAR API responses for tenant/user management.
 */

export type CstarRole = {
  id: string;
  name: string;
  description: string;
  createdDateTime: string;
  updatedDateTime: string;
};

export type CstarSsoUser = {
  id: string;
  ssoUserId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  userName: string;
  email: string;
  idpType: string;
  createdDateTime: string;
  updatedDateTime: string;
};

export type CstarTenantUser = {
  id: string;
  ssoUser: CstarSsoUser;
  isDeleted: boolean;
  createdDateTime: string;
  updatedDateTime: string;
  roles: CstarRole[];
};

export type CstarTenant = {
  id: string;
  name: string;
  ministryName: string;
  description: string;
  createdDateTime: string;
  updatedDateTime: string;
  createdBy: string;
  updatedBy: string;
  users?: CstarTenantUser[];
};

export type CstarUserTenantsResponse = {
  data: {
    tenants: CstarTenant[];
  };
};

// --- Shared service roles (per user per tenant) ---

export type CstarSharedServiceRoleGroup = {
  id: string;
  name: string;
};

export type CstarSharedServiceRole = {
  id: string;
  name: string;
  description: string;
  allowedIdentityProviders: string[];
  groups: CstarSharedServiceRoleGroup[];
};

export type CstarUserSharedServiceRolesResponse = {
  data: {
    sharedServiceRoles: CstarSharedServiceRole[];
  };
};

// --- Groups with shared service roles (per user per tenant) ---

export type CstarGroupSharedServiceRole = {
  id: string;
  name: string;
  description: string;
  allowedIdentityProviders?: string[];
  isDeleted: boolean;
  createdDateTime: string;
  updatedDateTime: string;
};

export type CstarUserGroup = {
  id: string;
  name: string;
  description: string;
  createdDateTime: string;
  updatedDateTime: string;
  sharedServiceRoles: CstarGroupSharedServiceRole[];
};

export type CstarUserGroupsResponse = {
  data: {
    groups: CstarUserGroup[];
  };
};
