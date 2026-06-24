import type { BaseN8nProjectRepository, N8nProjectRecord } from '../../../api/types/n8n-adapters';

export type PaginatedProjects = {
  projects: Array<{ id: string; name: string; type: string }>;
  totalCount: number;
};

export class ProjectRepository {
  constructor(private readonly projectRepository: BaseN8nProjectRepository) {}

  get metadata() {
    return this.projectRepository.metadata;
  }

  async findOneBy(where: { id: string }) {
    return await this.projectRepository.findOneBy(where);
  }

  async getPersonalProjectForUser(userId: string) {
    return await this.projectRepository.getPersonalProjectForUser(userId);
  }

  async getPersonalProjectForUserOrFail(userId: string) {
    return await this.projectRepository.getPersonalProjectForUserOrFail(userId);
  }

  create(data: { name: string; type: string; creatorId: string }): N8nProjectRecord {
    return this.projectRepository.create(data);
  }

  async save(entity: N8nProjectRecord): Promise<N8nProjectRecord> {
    return await this.projectRepository.save(entity);
  }

  /** Lists all n8n projects with offset-based pagination. */
  async listPaginated(page: number, pageSize: number): Promise<PaginatedProjects> {
    const offset = (page - 1) * pageSize;
    const countResult = await this.projectRepository.manager.query(
      `SELECT COUNT(*) as count FROM ${this.projectRepository.metadata.tableName}`,
    );
    const totalCount = Number.parseInt(countResult[0].count as string, 10);

    const rows = await this.projectRepository.manager.query(
      `SELECT id, name, type FROM ${this.projectRepository.metadata.tableName} ORDER BY name ASC LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );

    return {
      projects: rows.map((r) => ({ id: String(r.id), name: String(r.name), type: String(r.type) })),
      totalCount,
    };
  }
}
