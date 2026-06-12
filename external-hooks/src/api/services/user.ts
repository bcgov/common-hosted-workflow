import type { N8nOidcUser } from '../helpers/n8n-oidc';

export type BaseUserService = {
  changeUserRole(user: N8nOidcUser, options: { newRoleName: string }): Promise<void>;
};

export class UserService {
  constructor(private readonly impl: BaseUserService) {}

  async changeUserRole(user: N8nOidcUser, options: { newRoleName: string }): Promise<void> {
    return this.impl.changeUserRole(user, options);
  }
}
