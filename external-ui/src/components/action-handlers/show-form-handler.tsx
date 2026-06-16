import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { IconLoader2, IconCircleCheck, IconAlertTriangle } from '@tabler/icons-react';
import type { WilActionItem } from '../../services/backend/wil';
import { postWilChefsToken, postWilCallback } from '../../services/backend/wil';
import { getWhoami } from '../../services/backend/auth';
import { getStoredAppToken } from '../../services/backend/axios';
import { ChefsFormViewer } from '../chefs/chefs-form-viewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ShowFormHandlerProps {
  action: WilActionItem;
  tenantId: string;
  onInteractionSuccess?: () => void;
}

type InitData = {
  authToken: string;
  formId: string;
  baseUrl: string;
  submissionId?: string;
  prefillData: Record<string, unknown>;
  token: Record<string, unknown>;
  user: Record<string, unknown>;
  headers: Record<string, string>;
};

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const serverMessage =
      (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message ??
      (err.response?.data as { message?: string } | undefined)?.message;
    return serverMessage ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function buildUserProfile(claims: Record<string, unknown>): Record<string, unknown> {
  return {
    idpUserId: claims.idir_user_guid,
    username: claims.idir_username,
    firstName: claims.given_name,
    lastName: claims.family_name,
    fullName: claims.display_name,
    email: claims.email,
    idp: claims.identity_provider,
  };
}

function buildTokenObject(claims: Record<string, unknown>): Record<string, unknown> {
  return {
    sub: claims.sub,
    roles: claims.client_roles ?? [],
    email: claims.email,
    idp: claims.identity_provider,
  };
}

function buildUserObject(claims: Record<string, unknown>): Record<string, unknown> {
  return {
    name: claims.display_name,
    firstName: claims.given_name,
    lastName: claims.family_name,
    email: claims.email,
    username: claims.idir_username ?? claims.preferred_username,
    idp: claims.identity_provider,
  };
}

async function initializeForm(params: {
  tenantId: string;
  actionId: string;
  payload: Record<string, unknown>;
}): Promise<InitData> {
  const [tokenResponse, whoamiResponse] = await Promise.all([
    postWilChefsToken({ tenantId: params.tenantId, actionId: params.actionId }),
    getWhoami({}),
  ]);

  if (!whoamiResponse.ok || !whoamiResponse.oidc) {
    throw new Error('Failed to retrieve user identity.');
  }

  const userProfile = buildUserProfile(whoamiResponse.oidc.claims);
  const tokenObject = buildTokenObject(whoamiResponse.oidc.claims);
  const userObject = buildUserObject(whoamiResponse.oidc.claims);
  const formPreFillData = (params.payload.formPreFillData as Record<string, unknown>) ?? {};
  const submissionId = (params.payload.submissionId as string) || undefined;

  const prefillData: Record<string, unknown> = {
    ...formPreFillData,
    ...userProfile,
  };

  const userToken = getStoredAppToken();
  const headers: Record<string, string> = userToken ? { Authorization: `Bearer ${userToken}` } : {};

  return {
    authToken: tokenResponse.authToken,
    formId: tokenResponse.formId,
    baseUrl: tokenResponse.baseUrl,
    submissionId,
    prefillData,
    token: tokenObject,
    user: userObject,
    headers,
  };
}

export function ShowFormHandler({ action, tenantId, onInteractionSuccess }: Readonly<ShowFormHandlerProps>) {
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  }, [onInteractionSuccess]);

  const initMutation = useMutation({
    mutationFn: initializeForm,
  });

  const callbackMutation = useMutation({
    mutationFn: (params: { tenantId: string; actionId: string; body: Record<string, unknown> }) =>
      postWilCallback(params),
    onSuccess: () => {
      onInteractionSuccessRef.current?.();
    },
  });

  // Trigger initialization when action/tenant changes
  useEffect(() => {
    initMutation.mutate({
      tenantId,
      actionId: action.id,
      payload: action.payload,
    });
    // Reset callback state when action changes
    callbackMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id, tenantId]);

  const handleSubmissionComplete = useCallback(
    (detail: unknown) => {
      if (callbackMutation.isPending || callbackMutation.isSuccess) return;

      const detailObj = detail as Record<string, unknown> | null;
      const submission = detailObj?.submission as Record<string, unknown> | undefined;
      const submissionId =
        (submission?.id as string) ??
        (submission?._id as string) ??
        (detailObj?.id as string) ??
        (detailObj?._id as string) ??
        '';

      const formId = initMutation.data?.formId ?? '';

      callbackMutation.mutate({
        tenantId,
        actionId: action.id,
        body: { formId, submission_id: submissionId },
      });
    },
    [action.id, tenantId, callbackMutation, initMutation.data?.formId],
  );

  if (initMutation.isPending) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={20} className="animate-spin" aria-hidden="true" />
        <span>Loading form…</span>
      </div>
    );
  }

  if (initMutation.isError) {
    const message = extractErrorMessage(initMutation.error, 'Failed to load form. Please try again.');
    return (
      <div className="p-6" aria-live="polite">
        <Alert variant="destructive">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (callbackMutation.isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm" aria-live="polite">
        <IconCircleCheck size={32} className="text-green-600" aria-hidden="true" />
        <p className="font-medium text-[var(--bc-text)]">Form submitted successfully</p>
        <p className="text-[var(--bc-muted)]">Your response has been recorded.</p>
      </div>
    );
  }

  const initData = initMutation.data;
  if (!initData) return null;

  return (
    <div className="relative h-full overflow-auto p-4">
      {callbackMutation.isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-[var(--bc-muted)]">
            <IconLoader2 size={20} className="animate-spin" aria-hidden="true" />
            <span>Submitting…</span>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {callbackMutation.isError && (
          <div className="mb-4">
            <Alert variant="destructive">
              <IconAlertTriangle size={16} aria-hidden="true" />
              <AlertTitle>Submission Error</AlertTitle>
              <AlertDescription>
                {extractErrorMessage(callbackMutation.error, 'Failed to submit form response. Please try again.')}
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      <ChefsFormViewer
        formId={initData.formId}
        authToken={initData.authToken}
        baseUrl={initData.baseUrl}
        submissionId={initData.submissionId}
        prefillData={initData.prefillData}
        token={initData.token}
        user={initData.user}
        headers={initData.headers}
        onSubmissionComplete={handleSubmissionComplete}
      />
    </div>
  );
}
