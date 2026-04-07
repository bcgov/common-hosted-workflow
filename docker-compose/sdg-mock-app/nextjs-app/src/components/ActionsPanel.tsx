'use client';

import { useState } from 'react';
import type { ActionRequest, AppConfig } from '@/lib/api';
import { shortId, fmtDate, apiPatch, apiFetch } from '@/lib/api';
import { useToast } from './Toast';
import PayloadBlock from './PayloadBlock';

interface Props {
  actions: ActionRequest[];
  error: string | null;
  config: AppConfig;
  actorId: string;
  onRefresh: () => void;
}

export default function ActionsPanel({ actions, error, config, actorId, onRefresh }: Props) {
  const toast = useToast();

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="icon">⚡</span> Action Requests
          <span className="count-badge">{error ? '!' : actions.length}</span>
        </div>
      </div>
      <div className="panel-body">
        {error ? (
          <div className="empty-state">
            <div className="es-icon" style={{ color: 'var(--red)' }}>
              ✕
            </div>
            <div className="es-title" style={{ color: 'var(--red)' }}>
              Error loading actions
            </div>
            <div className="es-desc">{error}</div>
          </div>
        ) : actions.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">⚡</div>
            <div className="es-title">No action requests found</div>
            <div className="es-desc">Try adjusting the filters or check back later</div>
          </div>
        ) : (
          actions.map((a) => (
            <ActionCard key={a.id} action={a} config={config} actorId={actorId} toast={toast} onRefresh={onRefresh} />
          ))
        )}
      </div>
    </div>
  );
}

/* ── Individual Action Card ── */

interface ActionCardProps {
  action: ActionRequest;
  config: AppConfig;
  actorId: string;
  toast: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}

function ActionCard({ action: a, config, actorId, toast, onRefresh }: ActionCardProps) {
  const [patching, setPatching] = useState<string | null>(null);
  const [approvalSent, setApprovalSent] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const isPatchable = ['pending', 'in_progress'].includes(a.status);
  const isApproval =
    a.actionType === 'getapproval' &&
    a.status === 'pending' &&
    a.payload &&
    Array.isArray(a.payload.option) &&
    !!a.callbackUrl;

  const handlePatch = async (newStatus: string) => {
    setPatching(newStatus);
    try {
      await apiPatch(config, `/rest/custom/v1/actors/${encodeURIComponent(actorId)}/actions/${a.id}`, {
        status: newStatus,
      });
      toast(`Action → ${newStatus}`, 'success');
      onRefresh();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setPatching(null);
    }
  };

  const handleApproval = async (option: string) => {
    setSelectedOption(option);
    try {
      const basePath = `/rest/custom/v1/actors/${encodeURIComponent(actorId)}`;
      const actionsData = await apiFetch<ActionRequest[] | { items: ActionRequest[] }>(config, `${basePath}/actions`);
      const items = Array.isArray(actionsData) ? actionsData : actionsData.items || [];
      const action = items.find((x) => x.id === a.id);
      if (!action?.callbackUrl) throw new Error('Callback URL not found for this action');

      const method = (action.callbackMethod || 'POST').toUpperCase();

      // Use the callbackUrl as-is. In same-origin mode (no corsProxy/baseUrl),
      // extract just the path so the Next.js rewrite proxies it to n8n.
      // Otherwise use the full URL (direct or CORS proxy mode).
      let cbUrl = action.callbackUrl;
      if (!config.corsProxy && !config.baseUrl) {
        try {
          const parsed = new URL(cbUrl);
          cbUrl = parsed.pathname + parsed.search;
        } catch {
          /* keep original */
        }
      } else if (config.corsProxy) {
        try {
          const parsed = new URL(cbUrl);
          const proxyParsed = new URL(config.corsProxy);
          parsed.protocol = proxyParsed.protocol;
          parsed.host = proxyParsed.host;
          cbUrl = parsed.toString();
        } catch {
          /* keep original */
        }
      }

      const resp = await fetch(cbUrl, {
        method,
        headers: {
          'X-N8N-API-KEY': config.apiKey,
          'X-TENANT-ID': config.tenantId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ option }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
      setApprovalSent(true);
      toast(`Approval "${option}" submitted`, 'success');
      setTimeout(onRefresh, 1500);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      setSelectedOption(null);
    }
  };

  return (
    <div className="card">
      <div className="action-type">{a.actionType || 'unknown'}</div>
      <div className="card-top">
        <div>
          <div className="card-title">Action {shortId(a.id)}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {a.priority === 'critical' && <span className="tag tag-critical">critical</span>}
          <span className={`tag tag-${a.status}`}>{a.status}</span>
        </div>
      </div>

      {a.dueDate && (
        <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>⏰ Due: {fmtDate(a.dueDate)}</div>
      )}
      {a.callbackUrl && (
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, fontFamily: 'var(--mono)' }}>
          ↩ {a.callbackMethod || 'POST'} {a.callbackUrl}
        </div>
      )}

      <div className="card-meta">
        <span>🕐 {fmtDate(a.createdAt)}</span>
        <span>🔗 wf: {shortId(a.workflowId)}</span>
        <span>▶ exec: {shortId(a.workflowInstanceId)}</span>
        {a.projectId && <span>📁 {shortId(a.projectId)}</span>}
      </div>

      {isApproval ? (
        <div className="approval-block">
          <div className="approval-question">{String(a.payload.question ?? '')}</div>
          <div className="approval-options">
            {(a.payload.option as string[]).map((opt) => (
              <button
                key={opt}
                className={`approval-opt ${selectedOption === opt ? 'selected' : ''}`}
                disabled={!!selectedOption}
                onClick={() => handleApproval(opt)}
              >
                {selectedOption === opt && !approvalSent ? '…' : opt}
              </button>
            ))}
          </div>
          {approvalSent && <div className="approval-sent show">✓ Response submitted</div>}
        </div>
      ) : a.payload ? (
        <PayloadBlock label="Show payload" data={a.payload} />
      ) : null}

      {a.callbackPayloadSpec && <PayloadBlock label="Show callback spec" data={a.callbackPayloadSpec} />}

      {isPatchable && !isApproval && (
        <div className="action-buttons">
          <button className="action-btn completing" disabled={!!patching} onClick={() => handlePatch('in_progress')}>
            {patching === 'in_progress' ? '…' : '▶ In Progress'}
          </button>
          <button className="action-btn completing" disabled={!!patching} onClick={() => handlePatch('completed')}>
            {patching === 'completed' ? '…' : '✓ Complete'}
          </button>
          <button className="action-btn cancelling" disabled={!!patching} onClick={() => handlePatch('cancelled')}>
            {patching === 'cancelled' ? '…' : '✕ Cancel'}
          </button>
        </div>
      )}
    </div>
  );
}
