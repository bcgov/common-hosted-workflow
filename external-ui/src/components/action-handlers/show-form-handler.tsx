import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { IconLoader2, IconCircleCheck, IconAlertTriangle } from '@tabler/icons-react';
import type { WilActionItem } from '../../services/backend/wil';
import { postWilChefsToken, postWilCallback } from '../../services/backend/wil';
import { getWhoami } from '../../services/backend/auth';
import { ChefsFormViewer } from '../chefs/ChefsFormViewer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ShowFormHandlerProps {
  action: WilActionItem;
  tenantId: string;
  onInteractionSuccess?: () => void;
}

type InitState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      authToken: string;
      formId: string;
      baseUrl: string;
      submissionId?: string;
      prefillData: Record<string, unknown>;
      token: Record<string, unknown>;
      user: Record<string, unknown>;
    };

type CallbackState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; message: string };

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

export function ShowFormHandler({ action, tenantId, onInteractionSuccess }: Readonly<ShowFormHandlerProps>) {
  const [initState, setInitState] = useState<InitState>({ status: 'loading' });
  const [callbackState, setCallbackState] = useState<CallbackState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // Stabilize callback identity using refs for values that change frequently
  const initStateRef = useRef(initState);
  const callbackStateRef = useRef(callbackState);
  const onInteractionSuccessRef = useRef(onInteractionSuccess);

  useEffect(() => {
    initStateRef.current = initState;
  }, [initState]);
  useEffect(() => {
    callbackStateRef.current = callbackState;
  }, [callbackState]);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  }, [onInteractionSuccess]);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function initialize() {
      try {
        const [tokenResponse, whoamiResponse] = await Promise.all([
          postWilChefsToken({ tenantId, actionId: action.id }),
          getWhoami({ signal: controller.signal }),
        ]);

        if (controller.signal.aborted) return;

        if (!whoamiResponse.ok || !whoamiResponse.oidc) {
          setInitState({ status: 'error', message: 'Failed to retrieve user identity.' });
          return;
        }

        const userProfile = buildUserProfile(whoamiResponse.oidc.claims);
        const tokenObject = buildTokenObject(whoamiResponse.oidc.claims);
        const userObject = buildUserObject(whoamiResponse.oidc.claims);
        const formPreFillData = (action.payload.formPreFillData as Record<string, unknown>) ?? {};
        const submissionId = (action.payload.submissionId as string) || undefined;

        const prefillData: Record<string, unknown> = {
          ...formPreFillData,
          ...userProfile,
        };

        setInitState({
          status: 'ready',
          authToken: tokenResponse.authToken,
          formId: tokenResponse.formId,
          baseUrl: tokenResponse.baseUrl,
          submissionId,
          prefillData,
          token: tokenObject,
          user: userObject,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = extractErrorMessage(err, 'Failed to load form. Please try again.');
        setInitState({ status: 'error', message });
      }
    }

    initialize();

    return () => {
      controller.abort();
    };
  }, [action.id, action.payload.formPreFillData, action.payload.submissionId, tenantId]);

  // Stable callback — only depends on action.id and tenantId (primitives)
  const handleSubmissionComplete = useCallback(
    async (detail: unknown) => {
      const currentCallbackState = callbackStateRef.current;
      if (currentCallbackState.status === 'submitting' || currentCallbackState.status === 'success') return;

      setCallbackState({ status: 'submitting' });

      const detailObj = detail as Record<string, unknown> | null;
      const submission = detailObj?.submission as Record<string, unknown> | undefined;
      const submissionId =
        (submission?.id as string) ??
        (submission?._id as string) ??
        (detailObj?.id as string) ??
        (detailObj?._id as string) ??
        '';

      const currentInitState = initStateRef.current;
      const formId = currentInitState.status === 'ready' ? currentInitState.formId : '';

      try {
        await postWilCallback({
          tenantId,
          actionId: action.id,
          body: { formId, submission_id: submissionId },
        });
        setCallbackState({ status: 'success' });
        onInteractionSuccessRef.current?.();
      } catch (err) {
        const message = extractErrorMessage(err, 'Failed to submit form response. Please try again.');
        setCallbackState({ status: 'error', message });
      }
    },
    [action.id, tenantId],
  );

  if (initState.status === 'loading') {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={20} className="animate-spin" aria-hidden="true" />
        <span>Loading form…</span>
      </div>
    );
  }

  if (initState.status === 'error') {
    return (
      <div className="p-6" aria-live="polite">
        <Alert variant="destructive">
          <IconAlertTriangle size={16} aria-hidden="true" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{initState.message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (callbackState.status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm" aria-live="polite">
        <IconCircleCheck size={32} className="text-green-600" aria-hidden="true" />
        <p className="font-medium text-[var(--bc-text)]">Form submitted successfully</p>
        <p className="text-[var(--bc-muted)]">Your response has been recorded.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-auto p-4">
      {callbackState.status === 'submitting' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-[var(--bc-muted)]">
            <IconLoader2 size={20} className="animate-spin" aria-hidden="true" />
            <span>Submitting…</span>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {callbackState.status === 'error' && (
          <div className="mb-4">
            <Alert variant="destructive">
              <IconAlertTriangle size={16} aria-hidden="true" />
              <AlertTitle>Submission Error</AlertTitle>
              <AlertDescription>{callbackState.message}</AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      <ChefsFormViewer
        formId={initState.formId}
        authToken={initState.authToken}
        baseUrl={initState.baseUrl}
        submissionId={initState.submissionId}
        prefillData={initState.prefillData}
        token={initState.token}
        user={initState.user}
        onSubmissionComplete={handleSubmissionComplete}
      />
    </div>
  );
}
