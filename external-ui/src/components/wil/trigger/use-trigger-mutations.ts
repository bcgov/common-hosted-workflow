import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trigger, TriggerPayload } from '../../../services/backend/trigger-types';
import { createTrigger, updateTrigger, callbackTrigger } from '../../../services/backend/triggers';

interface UseTriggerMutationsParams {
  tenantId: string;
  userEmail: string;
  onCreated: (trigger: Trigger) => void;
  onUpdated: (trigger: Trigger) => void;
  onCallbackSuccess: () => void;
  onCallbackError: (err: Error) => void;
  onCallbackSettled: () => void;
}

/** Owns the backend CRUD + callback mutations for triggers, decoupled from UI state. */
export function useTriggerMutations({
  tenantId,
  userEmail,
  onCreated,
  onUpdated,
  onCallbackSuccess,
  onCallbackError,
  onCallbackSettled,
}: UseTriggerMutationsParams) {
  const queryClient = useQueryClient();
  const invalidateTriggers = () => queryClient.invalidateQueries({ queryKey: ['triggers', tenantId] });

  const createMutation = useMutation({
    mutationFn: (config: TriggerPayload) => createTrigger({ tenantId, config, actorId: userEmail }),
    onSuccess: (t) => {
      onCreated(t);
      invalidateTriggers();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ triggerId, config }: { triggerId: string; config: TriggerPayload }) =>
      updateTrigger({ tenantId, triggerId, config, actorId: userEmail }),
    onSuccess: (updated) => {
      onUpdated(updated);
      invalidateTriggers();
    },
  });

  const callbackMutation = useMutation({
    mutationFn: (triggerId: string) => callbackTrigger({ tenantId, triggerId }),
    onSuccess: onCallbackSuccess,
    onError: onCallbackError,
    onSettled: onCallbackSettled,
  });

  return { createMutation, updateMutation, callbackMutation };
}
