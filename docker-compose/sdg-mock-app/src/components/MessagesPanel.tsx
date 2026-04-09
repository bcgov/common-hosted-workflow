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
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="icon">✉</span> Messages
          <span className="count-badge">{error ? '!' : messages.length}</span>
        </div>
      </div>
      <div className="panel-body">
        {error ? (
          <div className="empty-state">
            <div className="es-icon" style={{ color: 'var(--red)' }}>
              ✕
            </div>
            <div className="es-title" style={{ color: 'var(--red)' }}>
              Error loading messages
            </div>
            <div className="es-desc">{error}</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">✉</div>
            <div className="es-title">No messages yet</div>
            <div className="es-desc">Configure settings and hit Refresh</div>
          </div>
        ) : (
          messages.map((m) => (
            <div className="card" key={m.id}>
              <div className="card-top">
                <div className="card-title">{m.title || '(no title)'}</div>
              </div>
              <div className="card-body">{m.body || ''}</div>
              <div className="card-meta">
                <span>🕐 {fmtDate(m.createdAt)}</span>
                <span>🔗 wf: {shortId(m.workflowId)}</span>
                <span>▶ exec: {shortId(m.workflowInstanceId)}</span>
                {m.projectId && <span>📁 {shortId(m.projectId)}</span>}
              </div>
              {m.metadata && <PayloadBlock label="Show metadata" data={m.metadata} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
