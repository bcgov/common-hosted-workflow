import type { BaseN8nUserRepository, QueryBuilderLike } from '../../../api/types/n8n-adapters';
import type { N8nUser } from '../../../api/types/user';

const API_KEY_AUDIENCE = 'public-api'; // pragma: allowlist secret
const ADMIN_ROLE_SLUGS = ['global:owner', 'global:admin'] as const;

export class UserRepository {
  constructor(private readonly userRepository: BaseN8nUserRepository) {}

  get metadata() {
    return this.userRepository.metadata;
  }

  async findByEmail(email: string, relations?: string[]) {
    return await this.userRepository.findOne({ where: { email }, relations });
  }

  async getUserForApiKey(apiKey: string) {
    return await this.userRepository.findOne({
      where: {
        apiKeys: {
          apiKey,
          audience: API_KEY_AUDIENCE,
        },
      },
      relations: ['role'],
    });
  }

  async count(): Promise<number> {
    return await this.userRepository.count();
  }

  createQueryBuilder(alias: string): QueryBuilderLike {
    return this.userRepository.createQueryBuilder(alias);
  }

  async setUserDisabled(userId: string, disabled: boolean): Promise<void> {
    await this.userRepository.manager.query('UPDATE "user" SET "disabled" = $1 WHERE "id" = $2', [disabled, userId]);
  }

  async createUserWithProject(userData: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    disabled?: boolean;
    role?: { slug: string };
  }): Promise<{ user: N8nUser }> {
    return await this.userRepository.createUserWithProject(userData);
  }

  async findAdminEmails(): Promise<string[]> {
    const tableName = this.userRepository.metadata.tableName;
    const emailColumn = this.getColumnName('email');
    const roleSlugColumn = this.getColumnName('roleSlug');
    const disabledColumn = this.getColumnName('disabled');

    const rows = await this.userRepository.manager.query(
      `SELECT DISTINCT "${emailColumn}" FROM "${tableName}" WHERE "${roleSlugColumn}" IN ($1, $2) AND "${disabledColumn}" = $3 AND "${emailColumn}" IS NOT NULL`,
      [ADMIN_ROLE_SLUGS[0], ADMIN_ROLE_SLUGS[1], false],
    );

    return rows
      .map((row) => row[emailColumn])
      .filter((email): email is string => typeof email === 'string' && email.length > 0);
  }

  private getColumnName(propertyName: string): string {
    const column = this.userRepository.metadata.columns.find((entry) => entry.propertyName === propertyName);

    if (!column) {
      throw new Error(`Column metadata not found for user.${propertyName}`);
    }

    return column.databaseName;
  }
}
