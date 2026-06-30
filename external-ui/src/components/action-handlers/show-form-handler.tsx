import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { WilActionItem } from '../../services/backend/wil';
import { postWilChefsToken, postWilCallback } from '../../services/backend/wil';
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
export function ShowFormHandler({ action, tenantId, onInteractionSuccess }: Readonly<ShowFormHandlerProps>) {
  const { session } = useSessionSnapshot();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  }, [onInteractionSuccess]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id, action.payload, session?.oidc.claims, tenantId]);

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
    />
  );
}
