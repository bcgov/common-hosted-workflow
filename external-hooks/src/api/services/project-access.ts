import type { ProjectRepository } from '../../db/repository/n8n/project';
import type { ProjectRelationRepository } from '../../db/repository/n8n/project-relation';

/** Lists all project IDs the user can access in n8n (personal + project relations). */
export async function listProjectIdsAccessibleToUser(
  projectRelationRepository: ProjectRelationRepository,
  projectRepository: ProjectRepository,
  userId: string,
): Promise<string[]> {
  const relations = await projectRelationRepository.findAllByUser(userId);
  const ids = new Set<string>(relations.map((r) => r.projectId));
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  if (personal?.id) ids.add(personal.id);
  return [...ids];
}
