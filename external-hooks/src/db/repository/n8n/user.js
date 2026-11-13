"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const API_KEY_AUDIENCE = 'public-api'; // pragma: allowlist secret
const ADMIN_ROLE_SLUGS = ['global:owner', 'global:admin'];
class UserRepository {
    userRepository;
    constructor(userRepository) {
        this.userRepository = userRepository;
    }
    get metadata() {
        return this.userRepository.metadata;
    }
    async findByEmail(email, relations) {
        return await this.userRepository.findOne({ where: { email }, relations });
    }
    /** Loads an n8n user with its global role, as n8n's credential/project services require. */
    async findByIdWithRole(id) {
        return (await this.userRepository.findOne({ where: { id }, relations: ['role'] }));
    }
    async getUserForApiKey(apiKey) {
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
    async count() {
        return await this.userRepository.count();
    }
    createQueryBuilder(alias) {
        return this.userRepository.createQueryBuilder(alias);
    }
    async setUserDisabled(userId, disabled) {
        await this.userRepository.manager.query('UPDATE "user" SET "disabled" = $1 WHERE "id" = $2', [disabled, userId]);
    }
    async createUserWithProject(userData) {
        return await this.userRepository.createUserWithProject(userData);
    }
    /**
     * Returns the user ID of the first user with the given role slug, or null if none exists.
     * Used to resolve the global owner for tenant project sync.
     */
    async findUserIdByRoleSlug(roleSlug) {
        const rows = await this.userRepository.manager.query(`SELECT "id" FROM "user" WHERE "roleSlug" = $1 LIMIT 1`, [
            roleSlug,
        ]);
        return rows.length > 0 ? rows[0].id : null;
    }
    async findAdminEmails() {
        const tableName = this.userRepository.metadata.tableName;
        const emailColumn = this.getColumnName('email');
        const roleSlugColumn = this.getColumnName('roleSlug');
        const disabledColumn = this.getColumnName('disabled');
        const rows = await this.userRepository.manager.query(`SELECT DISTINCT "${emailColumn}" FROM "${tableName}" WHERE "${roleSlugColumn}" IN ($1, $2) AND "${disabledColumn}" = $3 AND "${emailColumn}" IS NOT NULL`, [ADMIN_ROLE_SLUGS[0], ADMIN_ROLE_SLUGS[1], false]);
        return rows
            .map((row) => row[emailColumn])
            .filter((email) => typeof email === 'string' && email.length > 0);
    }
    /**
     * Resolves display names for a batch of emails in a single query. The map is
     * keyed by lowercased email so callers can look up case-insensitively;
     * emails without a matching n8n user are simply absent.
     */
    async findUserNamesByEmails(emails) {
        const names = new Map();
        const uniqueEmails = [...new Set(emails.map((email) => email.trim()).filter((email) => email.length > 0))];
        if (!uniqueEmails.length) {
            return names;
        }
        const tableName = this.userRepository.metadata.tableName;
        const emailColumn = this.getColumnName('email');
        const firstNameColumn = this.getColumnName('firstName');
        const lastNameColumn = this.getColumnName('lastName');
        const rows = await this.userRepository.manager.query(`SELECT "${emailColumn}", "${firstNameColumn}", "${lastNameColumn}" FROM "${tableName}" WHERE LOWER("${emailColumn}") = ANY($1)`, [uniqueEmails.map((email) => email.toLowerCase())]);
        for (const row of rows) {
            const email = row[emailColumn];
            if (typeof email === 'string') {
                names.set(email.toLowerCase(), {
                    firstName: String(row[firstNameColumn] ?? ''),
                    lastName: String(row[lastNameColumn] ?? ''),
                });
            }
        }
        return names;
    }
    getColumnName(propertyName) {
        const column = this.userRepository.metadata.columns.find((entry) => entry.propertyName === propertyName);
        if (column) {
            return column.databaseName;
        }
        for (const relation of this.userRepository.metadata.relations) {
            const joinColumn = relation.joinColumns?.find((jc) => jc.propertyName === propertyName || jc.databaseName === propertyName);
            if (joinColumn) {
                return joinColumn.databaseName;
            }
        }
        throw new Error(`Column metadata not found for user.${propertyName}`);
    }
}
exports.UserRepository = UserRepository;
