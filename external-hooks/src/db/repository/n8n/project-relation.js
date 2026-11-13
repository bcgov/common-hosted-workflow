"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectRelationRepository = void 0;
const sql_1 = require("./sql");
class ProjectRelationRepository {
    projectRelationRepository;
    userMetadata;
    constructor(projectRelationRepository, userMetadata) {
        this.projectRelationRepository = projectRelationRepository;
        this.userMetadata = userMetadata;
    }
    get metadata() {
        return this.projectRelationRepository.metadata;
    }
    async findAllByUser(userId) {
        return await this.projectRelationRepository.findAllByUser(userId);
    }
    async findProjectRole(args) {
        // Use find with role relation loaded, since findOneBy doesn't load ManyToOne relations.
        // Cast required because our adapter type doesn't expose `find`, but at runtime this is
        // a full TypeORM Repository with `find` available.
        const repo = this.projectRelationRepository;
        const results = await repo.find({
            where: { userId: args.userId, projectId: args.projectId },
            relations: { role: true },
            take: 1,
        });
        return results.length > 0 ? (results[0].role ?? null) : null;
    }
    async save(relation) {
        return await this.projectRelationRepository.save(relation);
    }
    async delete(criteria) {
        return await this.projectRelationRepository.delete(criteria);
    }
    buildUserEmailLookup() {
        const projectRelationMetadata = this.projectRelationRepository.metadata;
        const userMetadata = this.userMetadata;
        const projectRelationTable = (0, sql_1.quoteIdentifier)(projectRelationMetadata.tableName);
        const userTable = (0, sql_1.quoteIdentifier)(userMetadata.tableName);
        const projectRelationProjectColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(projectRelationMetadata, 'projectId'));
        const projectRelationUserColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(projectRelationMetadata, 'userId'));
        const userIdColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(userMetadata, 'id'));
        const userEmailColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(userMetadata, 'email'));
        return {
            projectRelationProjectColumn,
            selectSql: `
        SELECT
          pr.${projectRelationProjectColumn} AS "projectId",
          u.${userEmailColumn} AS "email"
        FROM ${projectRelationTable} pr
        INNER JOIN ${userTable} u ON u.${userIdColumn} = pr.${projectRelationUserColumn}
      `,
        };
    }
    async queryUserEmails(sql, params) {
        return await this.projectRelationRepository.manager.query(sql, params);
    }
    async listUserEmailsByProjectIds(projectIds) {
        const { projectRelationProjectColumn, selectSql } = this.buildUserEmailLookup();
        const rows = await this.queryUserEmails(`${selectSql} WHERE pr.${projectRelationProjectColumn} = ANY($1)`, [
            projectIds,
        ]);
        return rows;
    }
    /**
     * Lists the distinct email addresses of each project's members holding one
     * of the given project-role slugs, keyed by projectId. The relation's `role`
     * column stores the slug directly (FK to role(slug)), and disabled users or
     * users without an email are excluded. Used to resolve rate-limit
     * notification recipients — project admins and editors; a personal
     * project's owner (`project:personalOwner`) is its only member.
     */
    async listMemberEmailsByProjectIdsAndRoles(projectIds, roleSlugs) {
        if (!projectIds.length || !roleSlugs.length) {
            return new Map();
        }
        const { projectRelationProjectColumn, selectSql } = this.buildUserEmailLookup();
        const projectRelationRoleColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(this.projectRelationRepository.metadata, 'role'));
        const userEmailColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(this.userMetadata, 'email'));
        const userDisabledColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(this.userMetadata, 'disabled'));
        const rows = await this.queryUserEmails(`${selectSql} WHERE pr.${projectRelationProjectColumn} = ANY($1)
         AND pr.${projectRelationRoleColumn} = ANY($2)
         AND u.${userDisabledColumn} = false
         AND u.${userEmailColumn} IS NOT NULL`, [projectIds, roleSlugs]);
        const emailsByProject = new Map();
        for (const row of rows) {
            const emails = emailsByProject.get(String(row.projectId)) ?? [];
            emails.push(String(row.email));
            emailsByProject.set(String(row.projectId), emails);
        }
        return emailsByProject;
    }
    /**
     * Counts the members (project relations) of each project in a single grouped
     * query. Projects without relations are absent from the map; callers treat a
     * missing entry as zero members.
     */
    async countMembersByProjectIds(projectIds) {
        if (!projectIds.length) {
            return new Map();
        }
        const projectRelationMetadata = this.projectRelationRepository.metadata;
        const projectRelationTable = (0, sql_1.quoteIdentifier)(projectRelationMetadata.tableName);
        const projectRelationProjectColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(projectRelationMetadata, 'projectId'));
        const rows = await this.queryUserEmails(`
        SELECT pr.${projectRelationProjectColumn} AS "projectId", COUNT(*) AS "count"
        FROM ${projectRelationTable} pr
        WHERE pr.${projectRelationProjectColumn} = ANY($1)
        GROUP BY pr.${projectRelationProjectColumn}
      `, [projectIds]);
        return new Map(rows.map((row) => [String(row.projectId), Number(row.count)]));
    }
}
exports.ProjectRelationRepository = ProjectRelationRepository;
