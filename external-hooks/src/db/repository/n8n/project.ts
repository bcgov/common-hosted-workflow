import type { BaseN8nProjectRepository, N8nProjectRecord } from '../../../api/types/n8n-adapters';

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
}
