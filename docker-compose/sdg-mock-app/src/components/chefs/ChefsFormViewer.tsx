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
  readOnly = false,
  language = 'en',
  isolateStyles = false,
  baseUrl = 'https://submit.digital.gov.bc.ca/app',
  onFormReady,
  onSubmissionComplete,
  onSubmissionError,
}: ChefsFormViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptStatus = useChefsScript();
  const [isFormMounted, setIsFormMounted] = useState(false);

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

    const formViewer = containerRef.current.querySelector('chefs-form-viewer');
    if (!formViewer) return;

    const handleFormReady = () => {
      setIsFormMounted(true);
      onFormReady?.({ formio: null });
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
    formViewer.addEventListener('formio:submit', handleSubmit);
    formViewer.addEventListener('formio:submitError', handleSubmitError);

    const shadowRoot = (formViewer as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
    if (shadowRoot && shadowRoot.children.length > 0) {
      queueMicrotask(() => setIsFormMounted(true));
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
      formViewer.removeEventListener('formio:submit', handleSubmit);
      formViewer.removeEventListener('formio:submitError', handleSubmitError);
    };
  }, [scriptStatus, headers, onFormReady, onSubmissionComplete, onSubmissionError]);

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
