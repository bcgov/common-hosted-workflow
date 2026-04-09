'use client';

import { FormEvent, useState } from 'react';
import type { AppConfig, FormConfig } from '@/lib/api';
import { rewriteUrl } from '@/lib/api';
import { useToast } from './Toast';
import GearIcon from './icons/GearIcon';

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
          <GearIcon size={13} />
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
