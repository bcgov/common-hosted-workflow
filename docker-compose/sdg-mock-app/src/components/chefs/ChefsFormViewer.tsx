'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChefsFormViewerProps } from './types';
import { useChefsScript } from './use-chefs-script.hook';

export function ChefsFormViewer({
  formId,
  authToken,
  apiKey,
  headers,
  submissionId,
  prefillData,
  readOnly = false,
  language = 'en',
  isolateStyles = false,
  baseUrl = 'https://submit.digital.gov.bc.ca/app',
  onFormReady,
  onSubmissionComplete,
  onSubmissionError,
}: Readonly<ChefsFormViewerProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptStatus = useChefsScript();
  const [isFormMounted, setIsFormMounted] = useState(false);

  console.log('[ChefsFormViewer] Render', { scriptStatus, formId, isFormMounted, hasPrefillData: !!prefillData });

  const headersAttr = headers ? `headers="${encodeURIComponent(JSON.stringify(headers))}"` : '';

  const attrs = [
    `form-id="${formId}"`,
    `base-url="${baseUrl}"`,
    authToken ? `auth-token="${authToken}"` : '',
    apiKey ? `api-key="${apiKey}"` : '',
    headersAttr,
    submissionId ? `submission-id="${submissionId}"` : '',
    readOnly ? `read-only="true"` : '',
    language ? `language="${language}"` : '',
    isolateStyles ? `isolate-styles="true"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = `<chefs-form-viewer ${attrs}></chefs-form-viewer>`;

    const formViewer = containerRef.current.querySelector('chefs-form-viewer');
    if (!formViewer) return;

    const injectStyles = (shadowRoot: ShadowRoot) => {
      if (shadowRoot.querySelector('#chefs-custom-styles')) return;
      const styleEl = document.createElement('style');
      styleEl.id = 'chefs-custom-styles';
      styleEl.textContent = `
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
        }
        .v-container,
        .v-container.main {
          max-width: 100% !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        label.col-form-label,
        label.control-label,
        label.form-check-label,
        .formio-component label,
        .form-group > label {
          color: #1a1a1a !important;
          font-weight: 600 !important;
          font-size: 14px !important;
        }
      `;
      shadowRoot.prepend(styleEl);
    };

    const existingShadowRoot = (formViewer as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
    if (existingShadowRoot) {
      injectStyles(existingShadowRoot);
    }

    const observer = new MutationObserver(() => {
      const shadowRoot = (formViewer as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
      if (shadowRoot) {
        injectStyles(shadowRoot);
        observer.disconnect();
      }
    });
    observer.observe(formViewer, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [attrs, formId, scriptStatus]);

  useEffect(() => {
    if (scriptStatus !== 'ready' || !containerRef.current) return;

    console.log('[ChefsFormViewer] Main effect running', {
      scriptStatus,
      formId,
      hasPrefillData: !!prefillData,
      prefillKeys: prefillData ? Object.keys(prefillData) : [],
      submissionId: submissionId ?? null,
    });

    const formViewer = containerRef.current.querySelector('chefs-form-viewer');
    if (!formViewer) {
      console.warn('[ChefsFormViewer] No <chefs-form-viewer> element found in container');
      return;
    }

    const handleFormReady = (event: Event) => {
      setIsFormMounted(true);
      const customEvent = event as CustomEvent;
      const formioInstance = customEvent.detail?.form ?? customEvent.detail;

      console.log('[ChefsFormViewer] formio:ready fired', {
        hasDetail: !!customEvent.detail,
        detailKeys: customEvent.detail ? Object.keys(customEvent.detail) : [],
        formioInstance: !!formioInstance,
        formioType: typeof formioInstance,
        hasSubmissionProp: formioInstance && typeof formioInstance === 'object' && 'submission' in formioInstance,
      });

      // Apply prefill data for fresh forms (no submissionId)
      if (prefillData && !submissionId) {
        console.log('[ChefsFormViewer] Attempting prefill via setSubmission', {
          prefillKeys: Object.keys(prefillData),
          prefillData,
        });

        const viewer = formViewer as unknown as { setSubmission?: (data: Record<string, unknown>) => void };
        if (typeof viewer.setSubmission === 'function') {
          console.log('[ChefsFormViewer] Calling setSubmission() on web component');
          viewer.setSubmission(prefillData);
        } else {
          console.warn('[ChefsFormViewer] setSubmission not available on web component, trying direct assignment');
          // Last resort: direct assignment on the formio instance
          if (formioInstance && typeof formioInstance === 'object' && 'submission' in formioInstance) {
            formioInstance.submission = { data: { ...prefillData } };
          }
        }
      } else {
        console.log('[ChefsFormViewer] Skipping prefill', {
          hasPrefillData: !!prefillData,
          hasSubmissionId: !!submissionId,
        });
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

    const shadowRoot = (formViewer as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
    if (shadowRoot && shadowRoot.children.length > 0) {
      console.log('[ChefsFormViewer] Shadow root already present, applying prefill via queueMicrotask');
      queueMicrotask(() => {
        setIsFormMounted(true);
        // If form is already ready, apply prefill data now
        if (prefillData && !submissionId) {
          const viewer = formViewer as unknown as { setSubmission?: (data: Record<string, unknown>) => void };
          if (typeof viewer.setSubmission === 'function') {
            console.log('[ChefsFormViewer] queueMicrotask: calling setSubmission()');
            viewer.setSubmission(prefillData);
          } else {
            console.warn('[ChefsFormViewer] queueMicrotask: setSubmission not available');
          }
        }
      });
    } else {
      console.log('[ChefsFormViewer] No shadow root yet, waiting for formio:ready event');
    }

    if (headers) {
      (formViewer as unknown as Record<string, unknown>).headers = headers;
    }

    const viewer = formViewer as HTMLElement & { load?: () => Promise<void> };
    if (typeof viewer.load === 'function') {
      viewer.load().catch(() => {});
    }

    return () => {
      formViewer.removeEventListener('formio:ready', handleFormReady);
      formViewer.removeEventListener('formio:submitDone', handleSubmit);
      formViewer.removeEventListener('formio:submitError', handleSubmitError);
    };
  }, [scriptStatus, headers, prefillData, submissionId, onFormReady, onSubmissionComplete, onSubmissionError]);

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
        <div className="flex items-center justify-center p-8">
          <div className="size-6 border-3 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
          <span className="ml-2 text-gray-400">Loading form…</span>
        </div>
      )}
      <div ref={containerRef} className={showSpinner ? 'hidden' : 'block'} />
    </div>
  );
}
