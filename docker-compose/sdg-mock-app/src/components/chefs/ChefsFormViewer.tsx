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

  // Encode headers as URL-encoded JSON (as per PR-1802)
  const headersAttr = headers ? `headers="${encodeURIComponent(JSON.stringify(headers))}"` : '';

  // Build attributes string
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

  // Set innerHTML when formId changes, inject styles to prevent layout shift
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

  // Attach event listeners once script is ready
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

    // Check if already rendered (in case we missed the ready event)
    const shadowRoot = (formViewer as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
    if (shadowRoot && shadowRoot.children.length > 0) {
      queueMicrotask(() => setIsFormMounted(true));
    }

    // Set headers as property directly (required for evalContext)
    if (headers) {
      (formViewer as unknown as Record<string, unknown>).headers = headers;
    }

    // Call load() method explicitly
    const viewer = formViewer as HTMLElement & { load?: () => Promise<void> };
    if (typeof viewer.load === 'function') {
      viewer.load().catch(() => {
        // Error handling is done via formio:submitError event
      });
    }

    return () => {
      formViewer.removeEventListener('formio:ready', handleFormReady);
      formViewer.removeEventListener('formio:submit', handleSubmit);
      formViewer.removeEventListener('formio:submitError', handleSubmitError);
    };
  }, [scriptStatus, headers, onFormReady, onSubmissionComplete, onSubmissionError]);

  if (scriptStatus === 'error') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: '#ea4335' }}>
        <p>Failed to load form. Please try refreshing the page.</p>
      </div>
    );
  }

  const isScriptLoading = scriptStatus === 'loading' || scriptStatus === 'idle';
  const showSpinner = isScriptLoading || !isFormMounted;

  return (
    <div style={{ position: 'relative' }}>
      {showSpinner && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={spinnerStyle} />
          <span style={{ marginLeft: 8, color: '#888' }}>Loading form…</span>
        </div>
      )}
      <div ref={containerRef} style={{ display: showSpinner ? 'none' : 'block' }} />
    </div>
  );
}

/** Simple CSS spinner via inline keyframes injected once */
const spinnerStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  border: '3px solid #e0e0e0',
  borderTopColor: '#1a73e8',
  borderRadius: '50%',
  animation: 'chefs-spin 0.8s linear infinite',
};

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('chefs-spinner-keyframes')) {
  const style = document.createElement('style');
  style.id = 'chefs-spinner-keyframes';
  style.textContent = `@keyframes chefs-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
