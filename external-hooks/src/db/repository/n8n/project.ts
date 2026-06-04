import type { N8nProjectRepository } from '../../../api/types/n8n-adapters';

export class ProjectRepository {
  constructor(private readonly projectRepository: N8nProjectRepository) {}

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
}
