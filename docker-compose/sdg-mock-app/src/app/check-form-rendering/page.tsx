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
      <div className="flex flex-col items-center justify-center min-h-screen font-sans">
        <h2 className="m-0">Missing form-id parameter</h2>
        <p className="text-gray-500 mt-2">
          Usage: <code>/check-form-rendering?form-id=YOUR_FORM_ID&auth-token=YOUR_AUTH_TOKEN</code>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-base">CHEFS Form Preview</span>
          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-mono">{formId}</span>
        </div>
        <div className="flex items-center gap-3">
          {submitStatus === 'sending' && <span className="text-sm text-blue-600">Sending…</span>}
          {submitStatus === 'success' && <span className="text-sm text-green-600">✓ Sent</span>}
          {submitStatus === 'error' && <span className="text-sm text-red-500">✗ Failed</span>}
          {submitted && (
            <button
              onClick={resetForm}
              className="flex items-center gap-1.5 bg-blue-600 text-white border-none rounded-md px-3.5 py-1.5 cursor-pointer text-sm font-medium"
              aria-label="Reset form"
            >
              Reset
            </button>
          )}
          <button
            onClick={openSettings}
            className="flex items-center bg-transparent border border-gray-300 rounded-md px-2.5 py-1.5 cursor-pointer text-gray-500 text-lg"
            title={hasWebhook ? `Webhook: ${webhookUrl}` : 'No webhook URL configured'}
            aria-label="Webhook settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Form */}
      <main className="flex justify-center p-4 pt-8">
        <div className="w-full max-w-[960px] bg-white rounded-lg shadow-md p-8">
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
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]"
          onClick={() => setSettingsOpen(false)}
        >
          <div className="bg-white rounded-xl p-6 w-full max-w-[480px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-4">Webhook Settings</h3>
            <label className="block text-sm font-medium text-gray-700">
              Submit Done Webhook URL
              <input
                type="url"
                value={draftUrl}
                onChange={(e) => setDraftUrl(e.target.value)}
                placeholder="e.g. http://localhost:5678/webhook/receive-contact"
                className="block w-full mt-1.5 px-3 py-2 border border-gray-300 rounded-md text-sm"
                autoFocus
              />
            </label>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              When the form is submitted, the submission data will be POSTed to this URL.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 border-none rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-blue-600 text-white border-none rounded-md cursor-pointer font-medium"
              >
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
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <ChefsFormPage />
    </Suspense>
  );
}
