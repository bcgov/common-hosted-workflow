import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChefsFormViewerProps } from './types';
import { useChefsScript } from './use-chefs-script.hook';

const DEFAULT_BASE_URL = 'https://submit.digital.gov.bc.ca/app';

export function ChefsFormViewer({
  formId,
  authToken,
  submissionId,
  prefillData,
  token,
  user,
  readOnly = false,
  language = 'en',
  baseUrl = DEFAULT_BASE_URL,
  onFormReady,
  onSubmissionComplete,
  onSubmissionError,
}: Readonly<ChefsFormViewerProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptStatus = useChefsScript(baseUrl);
  const [isFormMounted, setIsFormMounted] = useState(false);

  // Stabilize serialized objects to avoid unnecessary re-renders
  const tokenJson = useMemo(() => (token ? JSON.stringify(token) : ''), [token]);
  const userJson = useMemo(() => (user ? JSON.stringify(user) : ''), [user]);

  // Use refs for callbacks to keep the effect stable while always calling the latest version
  const onFormReadyRef = useRef(onFormReady);
  const onSubmissionCompleteRef = useRef(onSubmissionComplete);
  const onSubmissionErrorRef = useRef(onSubmissionError);
  const prefillDataRef = useRef(prefillData);

  useEffect(() => {
    onFormReadyRef.current = onFormReady;
  }, [onFormReady]);
  useEffect(() => {
    onSubmissionCompleteRef.current = onSubmissionComplete;
  }, [onSubmissionComplete]);
  useEffect(() => {
    onSubmissionErrorRef.current = onSubmissionError;
  }, [onSubmissionError]);
  useEffect(() => {
    prefillDataRef.current = prefillData;
  }, [prefillData]);

  // Single merged effect: inject web component, attach listeners, handle prefill, clean up
  useEffect(() => {
    if (!containerRef.current || scriptStatus !== 'ready') return;

    const attrs = [
      `form-id="${formId}"`,
      `base-url="${baseUrl}"`,
      authToken ? `auth-token="${authToken}"` : '',
      submissionId ? `submission-id="${submissionId}"` : '',
      tokenJson ? `token='${tokenJson}'` : '',
      userJson ? `user='${userJson}'` : '',
      readOnly ? `read-only="true"` : '',
      language ? `language="${language}"` : '',
      'isolate-styles',
    ]
      .filter(Boolean)
      .join(' ');

    containerRef.current.innerHTML = `<chefs-form-viewer ${attrs}></chefs-form-viewer>`;

    const formViewer = containerRef.current.querySelector('chefs-form-viewer');
    if (!formViewer) return;

    const handleFormReady = (event: Event) => {
      setIsFormMounted(true);
      const customEvent = event as CustomEvent;
      const formioInstance = customEvent.detail?.form ?? customEvent.detail;

      // Apply prefill data only for fresh forms (no submissionId)
      const currentPrefill = prefillDataRef.current;
      if (currentPrefill && !submissionId) {
        const viewer = formViewer as unknown as {
          setSubmission?: (data: Record<string, unknown>) => void;
        };
        if (typeof viewer.setSubmission === 'function') {
          viewer.setSubmission(currentPrefill);
        } else if (formioInstance && typeof formioInstance === 'object' && 'submission' in formioInstance) {
          formioInstance.submission = { data: { ...currentPrefill } };
        }
      }

      onFormReadyRef.current?.({ formio: formioInstance });
    };

    const handleSubmit = (event: Event) => {
      const customEvent = event as CustomEvent;
      onSubmissionCompleteRef.current?.(customEvent.detail);
    };

    const handleSubmitError = (event: Event) => {
      const customEvent = event as CustomEvent;
      onSubmissionErrorRef.current?.(customEvent.detail);
    };

    formViewer.addEventListener('formio:ready', handleFormReady);
    formViewer.addEventListener('formio:submitDone', handleSubmit);
    formViewer.addEventListener('formio:submitError', handleSubmitError);

    // Trigger load if the web component exposes a load method
    const viewer = formViewer as HTMLElement & { load?: () => Promise<void> };
    if (typeof viewer.load === 'function') {
      viewer.load().catch(() => {});
    }

    return () => {
      formViewer.removeEventListener('formio:ready', handleFormReady);
      formViewer.removeEventListener('formio:submitDone', handleSubmit);
      formViewer.removeEventListener('formio:submitError', handleSubmitError);
      setIsFormMounted(false);
    };
  }, [scriptStatus, formId, authToken, submissionId, baseUrl, tokenJson, userJson, readOnly, language]);

  if (scriptStatus === 'error') {
    return (
      <div className="flex items-center justify-center p-8 text-red-500">
        <p>Failed to load form. Please try refreshing the page.</p>
      </div>
    );
  }

  const isScriptLoading = scriptStatus === 'loading' || scriptStatus === 'idle';
  const showSpinner = isScriptLoading || !isFormMounted;

  return (
    <div className="relative">
      {showSpinner && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-8 bg-white">
          <div className="size-6 animate-spin rounded-full border-3 border-gray-200 border-t-blue-600" />
          <span className="ml-2 text-gray-400">Loading form…</span>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
