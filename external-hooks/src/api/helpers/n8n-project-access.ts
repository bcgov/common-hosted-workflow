/**
 * n8n project access: project relation row (team / shared) or personal project owner.
 */
export async function hasCallerN8nProjectAccess(
  projectRepository: { getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null> },
  projectRelationRepository: {
    findProjectRole: (args: { userId: string; projectId: string }) => Promise<unknown>;
  },
  userId: string,
  projectId: string,
): Promise<boolean> {
  const role = await projectRelationRepository.findProjectRole({ userId, projectId });
  if (role) return true;
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  return personal?.id === projectId;
}

/** All project IDs the user can access in n8n (personal + project relations). */
export async function getAccessibleProjectIdsForUser(
  projectRepository: { getPersonalProjectForUser: (userId: string) => Promise<{ id: string } | null> },
  projectRelationRepository: { findAllByUser: (userId: string) => Promise<Array<{ projectId: string }>> },
  userId: string,
): Promise<string[]> {
  const relations = await projectRelationRepository.findAllByUser(userId);
  const ids = new Set<string>(relations.map((r) => r.projectId));
  const personal = await projectRepository.getPersonalProjectForUser(userId);
  if (personal?.id) ids.add(personal.id);
  return [...ids];
}
