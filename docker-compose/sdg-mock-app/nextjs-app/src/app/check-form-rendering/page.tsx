'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

function ChefsFormPage() {
  const searchParams = useSearchParams();
  const formId = searchParams.get('form-id') || '';
  const authToken = searchParams.get('auth-token') || '';

  const [webhookUrl, setWebhookUrl] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [formLoaded, setFormLoaded] = useState(false);

  // Preload webhook URL from localStorage chef_config
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chef_config');
      if (raw) {
        const cfg = JSON.parse(raw);
        if (cfg.webhookUrl) setWebhookUrl(cfg.webhookUrl);
      }
    } catch {
      /* ignore */
    }
  }, []);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const viewerRef = useRef<HTMLElement | null>(null);

  // Load the CHEFS form viewer script
  useEffect(() => {
    if (document.querySelector('script[src*="chefs-form-viewer"]')) return;
    const script = document.createElement('script');
    script.src = 'https://submit.digital.gov.bc.ca/app/embed/chefs-form-viewer.min.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Load and attach the form when formId/authToken are present
  useEffect(() => {
    if (!formId) return;
    setFormLoaded(false);

    // Wait for custom element to be defined
    const interval = setInterval(() => {
      const viewer = viewerRef.current;
      if (viewer && typeof (viewer as any).load === 'function') {
        clearInterval(interval);
        viewer.setAttribute('form-id', formId);
        if (authToken) viewer.setAttribute('api-key', authToken);
        viewer.setAttribute('base-url', 'https://submit.digital.gov.bc.ca/app');
        viewer.setAttribute('language', 'en');
        viewer.setAttribute('isolate-styles', '');
        (viewer as any).load();
        setFormLoaded(true);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [formId, authToken, formKey]);

  // Listen for submitDone and forward to webhook
  const handleSubmitDone = useCallback(
    async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!webhookUrl) {
        console.warn('No webhook URL configured — submission not forwarded.');
        return;
      }
      setSubmitStatus('sending');
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(detail.submission),
        });
        if (!response.ok) throw new Error('Webhook failed: ' + response.status);
        setSubmitStatus('success');
        console.log('Submission sent to webhook successfully');
      } catch (err) {
        console.error('Failed to send submission to webhook:', err);
        setSubmitStatus('error');
      }
      setSubmitted(true);
      setTimeout(() => setSubmitStatus('idle'), 3000);
    },
    [webhookUrl],
  );

  const resetForm = () => {
    setFormKey((k) => k + 1);
    setSubmitted(false);
    setSubmitStatus('idle');
  };

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !formLoaded) return;
    viewer.addEventListener('formio:submitDone', handleSubmitDone);
    return () => viewer.removeEventListener('formio:submitDone', handleSubmitDone);
  }, [formLoaded, handleSubmitDone]);

  const openSettings = () => {
    setDraftUrl(webhookUrl);
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const url = draftUrl.trim();
    setWebhookUrl(url);
    setSettingsOpen(false);
    // Persist to localStorage chef_config
    try {
      const raw = localStorage.getItem('chef_config');
      const cfg = raw ? JSON.parse(raw) : {};
      cfg.webhookUrl = url;
      localStorage.setItem('chef_config', JSON.stringify(cfg));
    } catch {
      /* ignore */
    }
  };

  const hasWebhook = webhookUrl.trim().length > 0;

  if (!formId) {
    return (
      <div style={styles.errorContainer}>
        <h2 style={{ margin: 0 }}>Missing form-id parameter</h2>
        <p style={{ color: '#666', marginTop: 8 }}>
          Usage: <code>/check-form-rendering?form-id=YOUR_FORM_ID&auth-token=YOUR_AUTH_TOKEN</code>
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <span style={styles.title}>CHEFS Form Preview</span>
          <span style={styles.formIdBadge}>{formId}</span>
        </div>
        <div style={styles.topBarRight}>
          {submitStatus === 'sending' && <span style={styles.statusSending}>Sending…</span>}
          {submitStatus === 'success' && <span style={styles.statusSuccess}>✓ Sent</span>}
          {submitStatus === 'error' && <span style={styles.statusError}>✗ Failed</span>}

          {submitted && (
            <button onClick={resetForm} style={styles.resetBtn} title="Reset form" aria-label="Reset form">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Reset
            </button>
          )}

          <button
            onClick={openSettings}
            style={styles.settingsBtn}
            title={hasWebhook ? `Webhook: ${webhookUrl}` : 'No webhook URL configured'}
            aria-label="Webhook settings"
          >
            {/* Warning icon when no webhook */}
            {!hasWebhook && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 4 }}>
                <path
                  d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  stroke="#e67e22"
                  strokeWidth="2"
                  fill="none"
                />
                <line x1="12" y1="9" x2="12" y2="13" stroke="#e67e22" strokeWidth="2" />
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="#e67e22" strokeWidth="2" />
              </svg>
            )}
            {/* Gear icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Form container */}
      <main style={styles.main}>
        <div style={styles.formContainer}>
          {/* @ts-expect-error - custom web component */}
          <chefs-form-viewer key={formKey} ref={viewerRef} />
        </div>
      </main>

      {/* Settings modal */}
      {settingsOpen && (
        <div style={styles.overlay} onClick={() => setSettingsOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>Webhook Settings</h3>
            <label style={styles.label}>
              Submit Done Webhook URL
              <input
                type="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="e.g. http://localhost:5678/webhook/receive-contact"
                style={styles.input}
                autoFocus
              />
            </label>
            <p style={{ fontSize: 12, color: '#888', margin: '4px 0 16px' }}>
              When the form is submitted, the submission data will be POSTed to this URL.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setSettingsOpen(false)} style={styles.btnSecondary}>
                Cancel
              </button>
              <button onClick={saveSettings} style={styles.btnPrimary}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckFormRenderingPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Loading…</div>}>
      <ChefsFormPage />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f5f5f5',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
  },
  topBarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topBarRight: { display: 'flex', alignItems: 'center', gap: 12 },
  title: { fontWeight: 600, fontSize: 16 },
  formIdBadge: {
    fontSize: 12,
    background: '#e8f0fe',
    color: '#1a73e8',
    padding: '2px 8px',
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  settingsBtn: {
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '6px 10px',
    cursor: 'pointer',
    color: '#555',
  },
  resetBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  statusSending: { fontSize: 13, color: '#1a73e8' },
  statusSuccess: { fontSize: 13, color: '#34a853' },
  statusError: { fontSize: 13, color: '#ea4335' },
  main: { display: 'flex', justifyContent: 'center', padding: '2rem 1rem' },
  formContainer: {
    width: '100%',
    maxWidth: 960,
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    padding: '2rem',
  },
  errorContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    borderRadius: 10,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
  },
  label: { display: 'block', fontSize: 13, fontWeight: 500, color: '#333' },
  input: {
    display: 'block',
    width: '100%',
    marginTop: 6,
    padding: '8px 12px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 14,
  },
  btnPrimary: {
    padding: '8px 16px',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 500,
  },
  btnSecondary: {
    padding: '8px 16px',
    background: '#f1f1f1',
    color: '#333',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
};
