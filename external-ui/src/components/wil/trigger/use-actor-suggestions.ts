import { useQuery } from '@tanstack/react-query';
import { getCstarRoles, getCstarGroups, getCstarUsers } from '../../../services/backend/cstar-suggestions';
import type { TriggerActorType } from '../../../services/backend/trigger-types';

/**
 * Fetches actor suggestions (roles, groups, or users) from the backend
 * based on the selected actor type and tenant ID.
 *
 * Returns an empty array when:
 * - Actor type is not 'role', 'group', or 'user'
 * - No tenant ID is provided
 * - The API call fails or returns no data
 */
export function useActorSuggestions(actorType: TriggerActorType, tenantId: string): string[] {
  const enabled = (actorType === 'role' || actorType === 'group' || actorType === 'user') && tenantId.length > 0;

  const { data } = useQuery({
    queryKey: ['cstar-actor-suggestions', actorType, tenantId],
    queryFn: ({ signal }) => {
      if (actorType === 'role') {
        return getCstarRoles({ tenantId, signal });
      }
      if (actorType === 'group') {
        return getCstarGroups({ tenantId, signal });
      }
      return getCstarUsers({ tenantId, signal });
    },
    enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on failure — just show no suggestions
  });

  return data ?? [];
}
