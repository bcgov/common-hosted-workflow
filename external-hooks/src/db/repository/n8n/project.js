'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ProjectRepository = void 0;
class ProjectRepository {
  projectRepository;
  constructor(projectRepository) {
    this.projectRepository = projectRepository;
  }
  get metadata() {
    return this.projectRepository.metadata;
  }
  async findOneBy(where) {
    return await this.projectRepository.findOneBy(where);
  }
  async getPersonalProjectForUser(userId) {
    return await this.projectRepository.getPersonalProjectForUser(userId);
  }
  async getPersonalProjectForUserOrFail(userId) {
    return await this.projectRepository.getPersonalProjectForUserOrFail(userId);
  }
  create(data) {
    return this.projectRepository.create(data);
  }
  async save(entity) {
    return await this.projectRepository.save(entity);
  }
  /** Lists all n8n projects with offset-based pagination and optional filters. */
  async listPaginated(page, pageSize, filters) {
    const offset = (page - 1) * pageSize;
    const conditions = [];
    const params = [];
    let paramIndex = 1;
    if (filters?.ids) {
      // Caller-scoped listing: an empty id list can never match, so skip the
      // queries entirely (an `IN ()` clause would be invalid SQL anyway).
      if (filters.ids.length === 0) {
        return { projects: [], totalCount: 0 };
      }
      const idPlaceholders = filters.ids.map(() => `$${paramIndex++}`);
      conditions.push(`id IN (${idPlaceholders.join(', ')})`);
      params.push(...filters.ids);
    }
    if (filters?.type) {
      conditions.push(`type = $${paramIndex}`);
      params.push(filters.type);
      paramIndex++;
    }
    if (filters?.search) {
      conditions.push(`LOWER(name) LIKE $${paramIndex}`);
      params.push(`%${filters.search.toLowerCase()}%`);
      paramIndex++;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.projectRepository.manager.query(
      `SELECT COUNT(*) as count FROM ${this.projectRepository.metadata.tableName} ${whereClause}`,
      params,
    );
    const totalCount = Number.parseInt(countResult[0].count, 10);
    const rows = await this.projectRepository.manager.query(
      `SELECT id, name, type FROM ${this.projectRepository.metadata.tableName} ${whereClause} ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset],
    );
    return {
      projects: rows.map((r) => ({ id: String(r.id), name: String(r.name), type: String(r.type) })),
      totalCount,
    };
  }
}
exports.ProjectRepository = ProjectRepository;
