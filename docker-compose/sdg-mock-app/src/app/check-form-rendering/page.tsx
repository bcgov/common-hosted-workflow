'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useState } from 'react';
import { ChefsFormViewer } from '@/components/chefs';

function ChefsFormPage() {
  const searchParams = useSearchParams();
  const formId = searchParams.get('form-id') || '';
  const authToken = searchParams.get('auth-token') || '';

  const [webhookUrl, setWebhookUrl] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem('chef_config');
      if (raw) {
        const cfg = JSON.parse(raw);
        return cfg.webhookUrl ?? '';
      }
    } catch {
      /* ignore */
    }
    return '';
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const handleSubmissionComplete = useCallback(
    async (detail: unknown) => {
      if (!webhookUrl) {
        console.warn('No webhook URL configured — submission not forwarded.');
        return;
      }
      setSubmitStatus('sending');
      try {
        const submission = (detail as { submission?: unknown })?.submission ?? detail;
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submission),
        });
        if (!response.ok) throw new Error('Webhook failed: ' + response.status);
        setSubmitStatus('success');
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

  const openSettings = () => {
    setDraftUrl(webhookUrl);
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const url = draftUrl.trim();
    setWebhookUrl(url);
    setSettingsOpen(false);
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
            <button onClick={resetForm} style={styles.resetBtn} aria-label="Reset form">
              Reset
            </button>
          )}
          <button
            onClick={openSettings}
            style={styles.settingsBtn}
            title={hasWebhook ? `Webhook: ${webhookUrl}` : 'No webhook URL configured'}
            aria-label="Webhook settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Form — rendered by the reusable ChefsFormViewer */}
      <main style={styles.main}>
        <div style={styles.formContainer}>
          <ChefsFormViewer
            key={formKey}
            formId={formId}
            apiKey={authToken}
            onSubmissionComplete={handleSubmissionComplete}
            onSubmissionError={(err) => console.error('Form submission error:', err)}
            onFormReady={() => console.log('Form ready')}
          />
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
    fontSize: 18,
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
