import type { N8nOidcUser } from '../helpers/n8n-oidc';

export type N8nUserRoleService = {
  changeUserRole(user: N8nOidcUser, options: { newRoleName: string }): Promise<void>;
};
