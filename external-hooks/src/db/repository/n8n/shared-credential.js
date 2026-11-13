"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedCredentialRepository = void 0;
const sql_1 = require("./sql");
class SharedCredentialRepository {
    sharedCredentialRepository;
    constructor(sharedCredentialRepository) {
        this.sharedCredentialRepository = sharedCredentialRepository;
    }
    get metadata() {
        return this.sharedCredentialRepository.metadata;
    }
    get manager() {
        return this.sharedCredentialRepository.manager;
    }
    create(value) {
        return this.sharedCredentialRepository.create(value);
    }
    async save(value) {
        return await this.sharedCredentialRepository.save(value);
    }
    /**
     * Returns the n8n project IDs the given credential is shared with. Used to
     * authorize that a credential referenced by ID belongs to a project within
     * the caller's allowed scope before it is decrypted.
     */
    async findProjectIds(credentialId) {
        const metadata = this.sharedCredentialRepository.metadata;
        const table = (0, sql_1.quoteIdentifier)(metadata.tableName);
        const credentialColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(metadata, 'credentialsId'));
        const projectColumn = (0, sql_1.quoteIdentifier)((0, sql_1.getColumnName)(metadata, 'projectId'));
        const rows = await this.sharedCredentialRepository.manager.query(`
        SELECT sc.${projectColumn} AS "projectId"
        FROM ${table} sc
        WHERE sc.${credentialColumn} = $1
      `, [credentialId]);
        return rows.map((row) => String(row.projectId));
    }
}
exports.SharedCredentialRepository = SharedCredentialRepository;
