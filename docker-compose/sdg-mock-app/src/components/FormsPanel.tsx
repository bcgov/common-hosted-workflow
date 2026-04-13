'use client';

import { FormEvent, useState } from 'react';
import type { FormConfig } from '@/lib/api';
import { useToast } from './Toast';
import GearIcon from './icons/GearIcon';

interface Props {
  formConfig: FormConfig;
  actorId: string;
  onOpenFormSettings: () => void;
  onRefresh: () => void;
}

export default function FormsPanel({ formConfig, actorId, onOpenFormSettings, onRefresh }: Props) {
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

    // The webhook URL is either absolute or relative.
    // Next.js rewrites /webhook/* to n8n automatically.
    let url = formConfig.webhookUrl;
    try {
      const parsed = new URL(url);
      // Convert absolute n8n URLs to same-origin paths so the Next.js rewrite handles them
      url = parsed.pathname + parsed.search;
    } catch {
      // already relative — use as-is
    }

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
    <div className="border-r border-border flex flex-col">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface sticky top-[95px] z-10">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="text-base">📋</span> Forms
        </div>
        <button
          className="inline-flex items-center p-1 rounded-md border border-border bg-surface-2 text-text cursor-pointer hover:border-border-hover hover:bg-surface-3 transition-all duration-150"
          onClick={onOpenFormSettings}
          title="Configure form webhook URL"
        >
          <GearIcon className="size-[13px]" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        <div className="bg-surface border border-border rounded-lg p-4 mb-2">
          <div className="text-[13px] font-semibold mb-3 flex items-center gap-1.5">
            📝 Disability Credit Application
          </div>
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">
                Name
              </label>
              <input
                type="text"
                placeholder="Your name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-border bg-surface-2 text-text text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="mb-3">
              <label className="block text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">
                Application Details
              </label>
              <textarea
                rows={3}
                placeholder="Your message"
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-2.5 py-2 rounded-md border border-border bg-surface-2 text-text text-sm resize-y focus:outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 rounded-md border-none bg-accent text-white text-sm font-semibold cursor-pointer hover:bg-[#3d7ae8] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
