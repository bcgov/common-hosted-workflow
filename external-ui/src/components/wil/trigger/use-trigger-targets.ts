import { useQuery } from '@tanstack/react-query';
import type { TriggerType } from '../../../services/backend/trigger-types';
import { listTriggerTargets, triggerTargetsQueryKey } from '../../../services/backend/triggers';

/** Published WIL Trigger nodes the tenant's workflows expose for this trigger type. */
export function useTriggerTargets(tenantId: string, source: TriggerType) {
  return useQuery({
    queryKey: triggerTargetsQueryKey(tenantId, source),
    queryFn: ({ signal }) => listTriggerTargets({ tenantId, source, signal }),
    enabled: Boolean(tenantId),
    retry: false,
  });
}
