import { useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WilActionItem } from '../../services/backend/wil';
import { postWilChefsToken, postWilCallback } from '../../services/backend/wil';
import type { WilCallbackResponse } from '../../services/backend/wil';
import { getStoredAppToken } from '../../services/backend/axios';
import { useSessionSnapshot, useTenantGroupsById, useTenantRolesById } from '../../state/session';
import { ChefsFormPanel } from '../chefs/chefs-form-panel';
import type { ChefsFormPanelInitData } from '../chefs/chefs-form-panel';
import type { HostSubmitDetail } from '../chefs/types';
import { extractCallbackFields } from '../chefs/field-extractor';
import { buildTokenObject, buildUserObject, buildUserProfile } from '../chefs/user-claims-utils';
import { extractSubmissionId } from '../chefs/submission-utils';
import { useClaimVerification, verifyClaimBeforeSubmit } from './use-claim-verification';
import { ClaimErrorView } from './claim-error-view';
import { isServerUnavailableError, SERVER_UNAVAILABLE_MESSAGE } from '../shared/error-utils';
import { buildCancelledActionSnapshot, buildCompletedActionSnapshot } from './cancelled-action';

interface ShowFormHandlerProps {
  action: WilActionItem;
  tenantId: string;
  onInteractionSuccess?: () => void;
  onRefresh?: () => void;
  onActionUpdated?: (action: WilActionItem | null) => void;
}

async function initializeForm(params: {
  tenantId: string;
  actionId: string;
  payload: Record<string, unknown>;
  claims: Record<string, unknown>;
  tenantRoles: readonly string[];
  tenantGroups: readonly string[];
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
    prefillData: submissionId ? undefined : { ...formPreFillData, ...buildUserProfile(params.claims) },
    token: buildTokenObject(params.claims),
    user: buildUserObject(params.claims, { roles: params.tenantRoles, groups: params.tenantGroups }),
    headers: userToken ? { Authorization: `Bearer ${userToken}` } : {},
    skipChefsSubmission: tokenResponse.skipChefsSubmission === true,
    callbackFieldMappings: tokenResponse.callbackFieldMappings,
    callbackMissingPathBehavior: tokenResponse.callbackMissingPathBehavior,
  };
}

/** Renders a CHEFS form for a `showform` action and posts the submission to the WIL callback API. */
export function ShowFormHandler({
  action,
  tenantId,
  onInteractionSuccess,
  onRefresh,
  onActionUpdated,
}: Readonly<ShowFormHandlerProps>) {
  const { session } = useSessionSnapshot();
  const tenantRoles = useTenantRolesById(tenantId);
  const tenantGroups = useTenantGroupsById(tenantId);
  const queryClient = useQueryClient();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  const onActionUpdatedRef = useRef(onActionUpdated);
  const { claimError, setClaimError } = useClaimVerification({
    tenantId,
    actionId: action.id,
    actorType: action.actorType,
  });
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
    onActionUpdatedRef.current = onActionUpdated;
  }, [onInteractionSuccess, onActionUpdated]);

  const initMutation = useMutation({ mutationFn: initializeForm });

  const callbackMutation = useMutation<
    WilCallbackResponse,
    Error,
    { tenantId: string; actionId: string; body: Record<string, unknown> }
  >({
    mutationFn: (params) => postWilCallback(params),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
      queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
      // The callback target was gone (e.g. finished n8n execution); the action was
      // auto-cancelled server-side. Flip the pane to the cancelled view (carrying the
      // reason) so the user sees why it was cancelled.
      if (result.cancelled) {
        onActionUpdatedRef.current?.(buildCancelledActionSnapshot(action, result));
        return;
      }
      // Form submitted: the action is completed server-side. Flip the pane to the
      // terminal (completed) view so claim/unclaim controls are no longer shown.
      onActionUpdatedRef.current?.(buildCompletedActionSnapshot(action));
      onInteractionSuccessRef.current?.();
    },
  });

  // Re-initialize whenever the action or session claims change
  useEffect(() => {
    if (!session?.oidc.claims) return;
    initMutation.mutate({
      tenantId,
      actionId: action.id,
      payload: action.payload,
      claims: session.oidc.claims,
      tenantRoles,
      tenantGroups,
    });
    callbackMutation.reset();
    setClaimError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id, action.payload, session?.oidc.claims, tenantId, tenantRoles, tenantGroups]);

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    onRefresh?.();
  }

  const skipChefsSubmission = initMutation.data?.skipChefsSubmission === true;

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

  // When skipChefsSubmission is enabled, the form is not submitted to CHEFS.
  // Instead the validated form data is sent to the callback URL. If the action
  // defines field mappings, only the selected fields are sent; otherwise the
  // full form data is sent.
  const handleHostSubmit = useCallback(
    (detail: HostSubmitDetail) => {
      // Ignore draft saves — only forward final submissions
      if (detail.isDraft) return;
      if (callbackMutation.isPending || callbackMutation.isSuccess) return;

      const mappings = initMutation.data?.callbackFieldMappings;
      const formData =
        mappings && mappings.length > 0
          ? extractCallbackFields(detail.data, mappings, initMutation.data?.callbackMissingPathBehavior)
          : detail.data;

      callbackMutation.mutate({
        tenantId,
        actionId: action.id,
        body: { formId: initMutation.data?.formId ?? '', formData },
      });
    },
    [
      action.id,
      tenantId,
      callbackMutation,
      initMutation.data?.formId,
      initMutation.data?.callbackFieldMappings,
      initMutation.data?.callbackMissingPathBehavior,
    ],
  );

  const handleBeforeSubmit = useCallback(async (): Promise<boolean> => {
    // For role/group actions, verify the action is still claimed by this user before allowing submission
    try {
      const valid = await verifyClaimBeforeSubmit({
        tenantId,
        actionId: action.id,
        actorType: action.actorType,
        setClaimError,
      });
      if (!valid) return false;
    } catch {
      setClaimError('Unable to verify your claim on this action. Please refresh and try again.');
      return false;
    }
    setClaimError(null);
    return true;
  }, [action.id, action.actorType, tenantId, setClaimError]);

  if (claimError) {
    return <ClaimErrorView message={claimError} onRefresh={handleRefresh} />;
  }

  // Map upstream "server down"/timeout (502/504) to a retry-friendly message.
  // extractErrorMessage prefers the server-provided message for axios errors, so
  // substitute a plain Error carrying the user-facing text for these cases.
  const rawSubmitError = callbackMutation.isError ? callbackMutation.error : null;
  const submitError = isServerUnavailableError(rawSubmitError) ? new Error(SERVER_UNAVAILABLE_MESSAGE) : rawSubmitError;

  return (
    <ChefsFormPanel
      initPending={initMutation.isPending}
      initError={initMutation.isError ? initMutation.error : null}
      initData={initMutation.data}
      submitPending={callbackMutation.isPending}
      submitSuccess={callbackMutation.isSuccess}
      submitError={submitError}
      submitErrorFallback="Failed to submit form response. Please try again."
      submitMode={skipChefsSubmission ? 'none' : 'chefs'}
      onSubmissionComplete={handleSubmissionComplete}
      onBeforeSubmit={handleBeforeSubmit}
      onHostSubmit={skipChefsSubmission ? handleHostSubmit : undefined}
    />
  );
}
