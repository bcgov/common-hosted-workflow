'use client';

import { FormEvent, useState } from 'react';
import type { AppConfig, FormConfig } from '@/lib/api';
import { rewriteUrl } from '@/lib/api';
import { useToast } from './Toast';

interface Props {
  appConfig: AppConfig;
  formConfig: FormConfig;
  actorId: string;
  onOpenFormSettings: () => void;
  onRefresh: () => void;
}

export default function FormsPanel({ appConfig, formConfig, actorId, onOpenFormSettings, onRefresh }: Props) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) {
      toast('Name and message are required', 'error');
      return;
    }
    if (!formConfig.webhookUrl) {
      toast('Configure form webhook URL first', 'error');
      onOpenFormSettings();
      return;
    }

    setSubmitting(true);
    const url = rewriteUrl(formConfig.webhookUrl, appConfig);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), message: message.trim(), actorId }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
      toast('Application submitted', 'success');
      setName('');
      setMessage('');
      setTimeout(onRefresh, 2000);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="icon">📋</span> Forms
        </div>
        <button
          className="btn"
          style={{ padding: '4px 8px', fontSize: 11 }}
          onClick={onOpenFormSettings}
          title="Configure form webhook URL"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
      <div className="panel-body">
        <div className="form-card">
          <div className="form-title">📝 Disability Credit Application</div>
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label>Name</label>
              <input
                type="text"
                placeholder="Your name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Application Details</label>
              <textarea
                rows={3}
                placeholder="Your message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <button type="submit" className="form-submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
