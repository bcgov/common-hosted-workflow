import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconRefresh } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import type { WilActionItem } from '../../services/backend/wil';
import { postWilChefsToken, postWilCallback, getWilVerifyClaim } from '../../services/backend/wil';
import { getStoredAppToken } from '../../services/backend/axios';
import { useSessionSnapshot } from '../../state/session';
import { ChefsFormPanel } from '../chefs/chefs-form-panel';
import type { ChefsFormPanelInitData } from '../chefs/chefs-form-panel';
import { buildTokenObject, buildUserObject, buildUserProfile } from '../chefs/user-claims-utils';
import { extractSubmissionId } from '../chefs/submission-utils';

interface ShowFormHandlerProps {
  action: WilActionItem;
  tenantId: string;
  onInteractionSuccess?: () => void;
  onRefresh?: () => void;
}

async function initializeForm(params: {
  tenantId: string;
  actionId: string;
  payload: Record<string, unknown>;
  claims: Record<string, unknown>;
}): Promise<ChefsFormPanelInitData> {
  const tokenResponse = await postWilChefsToken({ tenantId: params.tenantId, actionId: params.actionId });
  const formPreFillData = (params.payload.formPreFillData as Record<string, unknown>) ?? {};
  const submissionId = (params.payload.submissionId as string) || undefined;
  const userToken = getStoredAppToken();

  return {
    authToken: tokenResponse.authToken,
    formId: tokenResponse.formId,
    baseUrl: tokenResponse.baseUrl,
    submissionId,
    prefillData: { ...formPreFillData, ...buildUserProfile(params.claims) },
    token: buildTokenObject(params.claims),
    user: buildUserObject(params.claims),
    headers: userToken ? { Authorization: `Bearer ${userToken}` } : {},
  };
}

/** Renders a CHEFS form for a `showform` action and posts the submission to the WIL callback API. */
export function ShowFormHandler({ action, tenantId, onInteractionSuccess, onRefresh }: Readonly<ShowFormHandlerProps>) {
  const { session } = useSessionSnapshot();
  const queryClient = useQueryClient();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  const [claimError, setClaimError] = useState<string | null>(null);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  }, [onInteractionSuccess]);

  // Verify claim on mount for role/group actions
  useEffect(() => {
    if (action.actorType !== 'role' && action.actorType !== 'group') return;
    let cancelled = false;
    getWilVerifyClaim({ tenantId, actionId: action.id })
      .then((result) => {
        if (!cancelled && !result.valid) {
          setClaimError('This action is no longer assigned to you. Another user may have unclaimed it.');
        }
      })
      .catch(() => {
        // Silently ignore verify errors on mount — the submit check will catch it
      });
    return () => {
      cancelled = true;
    };
  }, [action.id, action.actorType, tenantId]);

  const initMutation = useMutation({ mutationFn: initializeForm });

  const callbackMutation = useMutation({
    mutationFn: (params: { tenantId: string; actionId: string; body: Record<string, unknown> }) =>
      postWilCallback(params),
    onSuccess: () => onInteractionSuccessRef.current?.(),
  });

  // Re-initialize whenever the action or session claims change
  useEffect(() => {
    if (!session?.oidc.claims) return;
    initMutation.mutate({ tenantId, actionId: action.id, payload: action.payload, claims: session.oidc.claims });
    callbackMutation.reset();
    setClaimError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id, action.payload, session?.oidc.claims, tenantId]);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    onRefresh?.();
  }

  const handleSubmissionComplete = useCallback(
    (detail: unknown) => {
      if (callbackMutation.isPending || callbackMutation.isSuccess) return;
      callbackMutation.mutate({
        tenantId,
        actionId: action.id,
        body: { formId: initMutation.data?.formId ?? '', submission_id: extractSubmissionId(detail) },
      });
    },
    [action.id, tenantId, callbackMutation, initMutation.data?.formId],
  );

  const handleBeforeSubmit = useCallback(async (): Promise<boolean> => {
    // For role/group actions, verify the action is still claimed by this user before allowing submission
    if (action.actorType === 'role' || action.actorType === 'group') {
      try {
        const result = await getWilVerifyClaim({ tenantId, actionId: action.id });
        if (!result.valid) {
          setClaimError('This action is no longer assigned to you. Another user may have unclaimed it.');
          return false;
        }
      } catch {
        setClaimError('Unable to verify your claim on this action. Please refresh and try again.');
        return false;
      }
    }
    setClaimError(null);
    return true;
  }, [action.id, action.actorType, tenantId]);

  if (claimError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {claimError}
        </div>
        <p className="text-sm text-[var(--bc-muted)]">Please refresh to see the current state of this action.</p>
        <Button variant="outline" onClick={handleRefresh}>
          <IconRefresh size={14} aria-hidden="true" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <ChefsFormPanel
      initPending={initMutation.isPending}
      initError={initMutation.isError ? initMutation.error : null}
      initData={initMutation.data}
      submitPending={callbackMutation.isPending}
      submitSuccess={callbackMutation.isSuccess}
      submitError={callbackMutation.isError ? callbackMutation.error : null}
      submitErrorFallback="Failed to submit form response. Please try again."
      onSubmissionComplete={handleSubmissionComplete}
      onBeforeSubmit={handleBeforeSubmit}
    />
  );
}
