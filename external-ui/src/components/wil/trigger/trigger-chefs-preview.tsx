import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Trigger } from '../../../services/backend/trigger-types';
import { getTriggerChefsToken, callbackTrigger } from '../../../services/backend/triggers';
import { getStoredAppToken } from '../../../services/backend/axios';
import { useSessionSnapshot, useTenantGroupsById, useTenantRolesById } from '../../../state/session';
import { ChefsFormPanel } from '../../chefs/chefs-form-panel';
import type { ChefsFormPanelInitData } from '../../chefs/chefs-form-panel';
import { buildTokenObject, buildUserObject } from '../../chefs/user-claims-utils';
import { extractSubmissionId } from '../../chefs/submission-utils';

async function initializeForm(params: {
  tenantId: string;
  triggerId: string;
  claims: Record<string, unknown>;
  tenantRoles: readonly string[];
  tenantGroups: readonly string[];
}): Promise<ChefsFormPanelInitData> {
  const tokenResponse = await getTriggerChefsToken({ tenantId: params.tenantId, triggerId: params.triggerId });
  const userToken = getStoredAppToken();
  return {
    authToken: tokenResponse.authToken,
    formId: tokenResponse.formId,
    baseUrl: tokenResponse.baseUrl,
    token: buildTokenObject(params.claims),
    user: buildUserObject(params.claims, { roles: params.tenantRoles, groups: params.tenantGroups }),
    headers: userToken ? { Authorization: `Bearer ${userToken}` } : {},
  };
}

interface TriggerChefsPreviewProps {
  trigger: Trigger;
  tenantId: string;
}

export function TriggerChefsPreview({ trigger, tenantId }: Readonly<TriggerChefsPreviewProps>) {
  const { session } = useSessionSnapshot();
  const tenantRoles = useTenantRolesById(tenantId);
  const tenantGroups = useTenantGroupsById(tenantId);

  const initMutation = useMutation({ mutationFn: initializeForm });

  const [submitStatus, setSubmitStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<Error | null>(null);

  const callbackMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => callbackTrigger({ tenantId, triggerId: trigger.id, body }),
    onMutate: () => {
      setSubmitStatus('pending');
      setSubmitError(null);
    },
    onSuccess: () => setSubmitStatus('success'),
    onError: (err) => {
      setSubmitStatus('error');
      setSubmitError(err);
    },
  });

  useEffect(() => {
    if (!session?.oidc.claims) return;
    initMutation.mutate({
      tenantId,
      triggerId: trigger.id,
      claims: session.oidc.claims,
      tenantRoles,
      tenantGroups,
    });
    // Reset submission state when trigger or session changes
    setSubmitStatus('idle');
    setSubmitError(null);
    callbackMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger.id, tenantId, session?.oidc.claims, tenantRoles, tenantGroups]);

  // callbackMutation.mutate is stable across renders (TanStack Query wraps it in useCallback
  // with a ref internally), so it is safe as a useCallback dep without causing churn.
  const handleSubmissionComplete = useCallback(
    (detail: unknown) => {
      if (submitStatus === 'pending' || submitStatus === 'success') return;
      callbackMutation.mutate({ formId: initMutation.data?.formId ?? '', submission_id: extractSubmissionId(detail) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [submitStatus, callbackMutation.mutate, initMutation.data?.formId],
  );

  return (
    <ChefsFormPanel
      initPending={initMutation.isPending}
      initError={initMutation.isError ? initMutation.error : null}
      initData={initMutation.data}
      submitPending={submitStatus === 'pending'}
      submitSuccess={submitStatus === 'success'}
      submitError={submitStatus === 'error' ? submitError : null}
      successTitle="Workflow Triggered"
      successMessage="Your workflow has been triggered successfully."
      errorTitle="Trigger Failed"
      submitErrorFallback="Unable to trigger the workflow. Please try again or contact your administrator."
      onSubmissionComplete={handleSubmissionComplete}
    />
  );
}
