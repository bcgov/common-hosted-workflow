'use client';

import type { Message } from '@/lib/api';
import { shortId, fmtDate } from '@/lib/api';
import PayloadBlock from './PayloadBlock';

interface Props {
  messages: Message[];
  error: string | null;
}

export default function MessagesPanel({ messages, error }: Props) {
  return (
    <div className="border-r border-border flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface sticky top-0 z-10">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="text-base">✉</span> Messages
          <span className="bg-accent-soft text-accent px-2 py-0.5 rounded-full text-[11px] font-bold font-mono">
            {error ? '!' : messages.length}
          </span>
        </div>
      </div>
      <div className="flex-1 p-3 flex flex-col gap-2">
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 px-5 text-text-dim text-center flex-1">
            <div className="text-3xl mb-2.5 opacity-50 text-red-400">✕</div>
            <div className="text-sm font-semibold text-red-400">Error loading messages</div>
            <div className="text-xs">{error}</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-5 text-text-dim text-center flex-1">
            <div className="text-3xl mb-2.5 opacity-50">✉</div>
            <div className="text-sm font-semibold">No messages yet</div>
            <div className="text-xs">Configure settings and hit Refresh</div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className="bg-surface border border-border rounded-lg px-4 py-3.5 transition-all duration-150 hover:border-border-hover hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="text-sm font-semibold leading-snug">{m.title || '(no title)'}</div>
              </div>
              <div className="text-[13px] text-text-muted leading-relaxed mt-1.5">{m.body || ''}</div>
              <div className="flex items-center gap-2.5 flex-wrap mt-2.5 text-[11px] text-text-dim font-mono">
                <span className="inline-flex items-center gap-1">🕐 {fmtDate(m.createdAt)}</span>
                <span className="inline-flex items-center gap-1">🔗 wf: {shortId(m.workflowId)}</span>
                <span className="inline-flex items-center gap-1">▶ exec: {shortId(m.workflowInstanceId)}</span>
                {m.projectId && <span className="inline-flex items-center gap-1">📁 {shortId(m.projectId)}</span>}
              </div>
              {m.metadata && <PayloadBlock label="Show metadata" data={m.metadata} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
