import { useCallback, useEffect, useRef, useState } from 'react';
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
  | { status: 'ready'; authToken: string; formId: string; baseUrl: string; prefillData: Record<string, unknown> };

type CallbackState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; message: string };

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

export function ShowFormHandler({ action, tenantId, onInteractionSuccess }: Readonly<ShowFormHandlerProps>) {
  const [initState, setInitState] = useState<InitState>({ status: 'loading' });
  const [callbackState, setCallbackState] = useState<CallbackState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

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
        const formPreFillData = (action.payload.FormPreFillData as Record<string, unknown>) ?? {};

        const prefillData: Record<string, unknown> = {
          ...formPreFillData,
          ...userProfile,
        };

        setInitState({
          status: 'ready',
          authToken: tokenResponse.authToken,
          formId: tokenResponse.formId,
          baseUrl: tokenResponse.baseUrl,
          prefillData,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to load form. Please try again.';
        setInitState({ status: 'error', message });
      }
    }

    initialize();

    return () => {
      controller.abort();
    };
  }, [action.id, action.payload.FormPreFillData, tenantId]);

  const handleSubmissionComplete = useCallback(
    async (detail: unknown) => {
      if (callbackState.status === 'submitting' || callbackState.status === 'success') return;

      setCallbackState({ status: 'submitting' });

      const submission = detail as { _id?: string } | null;
      const submissionId = submission?._id ?? '';

      try {
        await postWilCallback({
          tenantId,
          actionId: action.id,
          body: {
            formId: initState.status === 'ready' ? initState.formId : '',
            submission_id: submissionId,
          },
        });
        setCallbackState({ status: 'success' });
        onInteractionSuccess?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to submit form response. Please try again.';
        setCallbackState({ status: 'error', message });
      }
    },
    [action.id, tenantId, initState, callbackState.status, onInteractionSuccess],
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
      <div className="p-6">
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
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm">
        <IconCircleCheck size={32} className="text-green-600" aria-hidden="true" />
        <p className="font-medium text-[var(--bc-text)]">Form submitted successfully</p>
        <p className="text-[var(--bc-muted)]">Your response has been recorded.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-auto p-4">
      {callbackState.status === 'submitting' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
          <div className="flex items-center gap-2 text-sm text-[var(--bc-muted)]">
            <IconLoader2 size={20} className="animate-spin" aria-hidden="true" />
            <span>Submitting…</span>
          </div>
        </div>
      )}

      {callbackState.status === 'error' && (
        <div className="mb-4">
          <Alert variant="destructive">
            <IconAlertTriangle size={16} aria-hidden="true" />
            <AlertTitle>Submission Error</AlertTitle>
            <AlertDescription>{callbackState.message}</AlertDescription>
          </Alert>
        </div>
      )}

      <ChefsFormViewer
        formId={initState.formId}
        authToken={initState.authToken}
        baseUrl={initState.baseUrl}
        prefillData={initState.prefillData}
        onSubmissionComplete={handleSubmissionComplete}
      />
    </div>
  );
}
