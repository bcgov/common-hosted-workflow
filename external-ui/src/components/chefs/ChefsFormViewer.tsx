import { useEffect, useRef, useState } from 'react';
import type { ChefsFormViewerProps } from './types';
import { useChefsScript } from './use-chefs-script.hook';

const DEFAULT_BASE_URL = 'https://submit.digital.gov.bc.ca/app';

export function ChefsFormViewer({
  formId,
  authToken,
  prefillData,
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

  const attrs = [
    `form-id="${formId}"`,
    `base-url="${baseUrl}"`,
    authToken ? `auth-token="${authToken}"` : '',
    readOnly ? `read-only="true"` : '',
    language ? `language="${language}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Inject the web component element into the DOM
  useEffect(() => {
    if (!containerRef.current || scriptStatus !== 'ready') return;
    containerRef.current.innerHTML = `<chefs-form-viewer ${attrs}></chefs-form-viewer>`;
  }, [attrs, scriptStatus]);

  // Attach event listeners and handle prefill
  useEffect(() => {
    if (scriptStatus !== 'ready' || !containerRef.current) return;

    const formViewer = containerRef.current.querySelector('chefs-form-viewer');
    if (!formViewer) return;

    const handleFormReady = (event: Event) => {
      setIsFormMounted(true);
      const customEvent = event as CustomEvent;
      const formioInstance = customEvent.detail?.form ?? customEvent.detail;

      // Apply prefill data for fresh forms (no submissionId)
      if (prefillData) {
        const viewer = formViewer as unknown as {
          setSubmission?: (data: Record<string, unknown>) => void;
        };
        if (typeof viewer.setSubmission === 'function') {
          viewer.setSubmission(prefillData);
        } else if (formioInstance && typeof formioInstance === 'object' && 'submission' in formioInstance) {
          formioInstance.submission = { data: { ...prefillData } };
        }
      }

      onFormReady?.({ formio: formioInstance });
    };

    const handleSubmit = (event: Event) => {
      const customEvent = event as CustomEvent;
      onSubmissionComplete?.(customEvent.detail);
    };

    const handleSubmitError = (event: Event) => {
      const customEvent = event as CustomEvent;
      onSubmissionError?.(customEvent.detail);
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
    };
  }, [scriptStatus, prefillData, onFormReady, onSubmissionComplete, onSubmissionError]);

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
