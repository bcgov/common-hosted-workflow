'use client';

import { useCallback, useState } from 'react';
import type { ActionRequest } from '@/lib/api';
import { shortId, fmtDate, apiPatch, apiCallback, fetchChefsToken } from '@/lib/api';
import { useToast } from './Toast';
import PayloadBlock from './PayloadBlock';
import ChefsFormModal from './ChefsFormModal';

interface Props {
  actions: ActionRequest[];
  error: string | null;
  actorId: string;
  onRefresh: () => void;
}

const TAG_CLASSES: Record<string, string> = {
  active: 'bg-green-soft text-emerald-400',
  read: 'bg-green-soft text-emerald-400',
  pending: 'bg-amber-soft text-amber-400',
  in_progress: 'bg-accent-soft text-accent',
  completed: 'bg-green-soft text-emerald-400',
  cancelled: 'bg-red-soft text-red-400',
  expired: 'bg-red-soft text-red-400',
  deleted: 'bg-red-soft text-red-400',
  critical: 'bg-red-soft text-red-400',
  normal: 'bg-surface-3 text-text-muted',
};

export default function ActionsPanel({ actions, error, actorId, onRefresh }: Props) {
  const toast = useToast();

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface sticky top-[95px] z-10">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="text-base">⚡</span> Action Requests
          <span className="bg-accent-soft text-accent px-2 py-0.5 rounded-full text-[11px] font-bold font-mono">
            {error ? '!' : actions.length}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {error ? (
          <div className="flex flex-col items-center justify-center py-12 px-5 text-text-dim text-center flex-1">
            <div className="text-3xl mb-2.5 opacity-50 text-red-400">✕</div>
            <div className="text-sm font-semibold text-red-400">Error loading actions</div>
            <div className="text-xs">{error}</div>
          </div>
        ) : actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-5 text-text-dim text-center flex-1">
            <div className="text-3xl mb-2.5 opacity-50">⚡</div>
            <div className="text-sm font-semibold">No action requests found</div>
            <div className="text-xs">Try adjusting the filters or check back later</div>
          </div>
        ) : (
          actions.map((a) => <ActionCard key={a.id} action={a} actorId={actorId} toast={toast} onRefresh={onRefresh} />)
        )}
      </div>
    </div>
  );
}

/* ── Individual Action Card ── */

interface ActionCardProps {
  action: ActionRequest;
  actorId: string;
  toast: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}

function ActionCard({ action: a, actorId, toast, onRefresh }: ActionCardProps) {
  const [patching, setPatching] = useState<string | null>(null);
  const [approvalSent, setApprovalSent] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // ── showform state ──
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formToken, setFormToken] = useState<string | null>(null);
  const [formName, setFormName] = useState<string | null>(null);
  const [formTokenLoading, setFormTokenLoading] = useState(false);

  const isPatchable = ['pending', 'in_progress'].includes(a.status);
  const isApproval =
    a.actionType === 'getapproval' && a.status === 'pending' && a.payload && Array.isArray(a.payload.option);

  // Resolve formId from payload — handle both casings (formId / FormID)
  const showFormId =
    a.actionType === 'showform' ? ((a.payload?.formId ?? a.payload?.FormID) as string | undefined) : undefined;

  // Resolve formName from payload
  const payloadFormName =
    a.actionType === 'showform' ? ((a.payload?.FormName ?? a.payload?.formName) as string | undefined) : undefined;

  const isShowForm = a.actionType === 'showform' && ['pending', 'in_progress'].includes(a.status) && !!showFormId;

  const handleOpenForm = useCallback(async () => {
    if (!showFormId) return;
    setFormTokenLoading(true);
    try {
      const { authToken, formName: name } = await fetchChefsToken(showFormId, a.id);
      setFormToken(authToken);
      setFormName(name);
      setFormModalOpen(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setFormTokenLoading(false);
    }
  }, [showFormId, a.id, toast]);

  const handleFormSubmitted = useCallback(
    async (detail: unknown) => {
      try {
        // The CHEFS formio:submitDone event wraps the saved submission
        // inside a `submission` property: detail.submission.id
        const submission = (detail as Record<string, unknown>)?.submission as Record<string, unknown> | undefined;
        const submissionId = submission?.id;

        await apiCallback(a.id, {
          formId: showFormId,
          actorId,
          submission_id: submissionId,
        });

        // Mark action as completed
        await apiPatch(`/actors/${encodeURIComponent(actorId)}/actions/${a.id}`, {
          status: 'completed',
        });

        toast('Form submitted & action completed', 'success');
        setTimeout(onRefresh, 1500);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      }
      setFormModalOpen(false);
      setFormToken(null);
      setFormName(null);
    },
    [a.id, showFormId, actorId, toast, onRefresh],
  );

  const handlePatch = async (newStatus: string) => {
    setPatching(newStatus);
    try {
      await apiPatch(`/actors/${encodeURIComponent(actorId)}/actions/${a.id}`, {
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
      // Send through the backend callback proxy using action ID
      await apiCallback(a.id, { option });

      setApprovalSent(true);
      toast(`Approval "${option}" submitted`, 'success');
      setTimeout(onRefresh, 1500);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : String(err), 'error');
      setSelectedOption(null);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3.5 transition-all duration-150 hover:border-border-hover hover:shadow-lg">
      <span className="font-mono text-[11px] font-medium text-purple-400 bg-purple-soft px-1.5 py-0.5 rounded inline-block mb-1.5">
        {a.actionType || 'unknown'}
      </span>
      <div className="flex items-start justify-between gap-2.5">
        <div className="text-sm font-semibold leading-snug">
          {isShowForm && payloadFormName ? (
            <>
              Action: Please fill the <span className="text-accent">{payloadFormName}</span>
            </>
          ) : (
            <>Action {shortId(a.id)}</>
          )}
        </div>
        <div className="flex gap-1.5 items-center">
          {a.priority === 'critical' && (
            <span
              className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide shrink-0 ${TAG_CLASSES.critical}`}
            >
              critical
            </span>
          )}
          <span
            className={`inline-flex px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide shrink-0 ${TAG_CLASSES[a.status] || TAG_CLASSES.normal}`}
          >
            {a.status}
          </span>
        </div>
      </div>

      {a.dueDate && <div className="text-[11px] text-amber-400 mt-1">⏰ Due: {fmtDate(a.dueDate)}</div>}

      <div className="flex items-center gap-2.5 flex-wrap mt-2.5 text-[11px] text-text-dim font-mono">
        <span className="inline-flex items-center gap-1">🕐 {fmtDate(a.createdAt)}</span>
        <span className="inline-flex items-center gap-1">🔗 wf: {shortId(a.workflowId)}</span>
        <span className="inline-flex items-center gap-1">▶ exec: {shortId(a.workflowInstanceId)}</span>
        {a.projectId && <span className="inline-flex items-center gap-1">📁 {shortId(a.projectId)}</span>}
      </div>

      {isApproval ? (
        <div className="mt-2.5 p-3.5 bg-surface-2 border border-border rounded-lg relative">
          <div className="text-sm font-semibold text-text mb-3 leading-snug">{String(a.payload.question ?? '')}</div>
          <div className="flex gap-2 flex-wrap">
            {(a.payload.option as string[]).map((opt) => (
              <button
                key={opt}
                className={`px-5 py-2 rounded-md border text-sm font-semibold cursor-pointer transition-all duration-150 ${
                  selectedOption === opt
                    ? 'bg-emerald-400 border-emerald-400 text-white pointer-events-none'
                    : 'border-accent bg-accent-soft text-accent hover:bg-accent hover:text-white'
                } disabled:opacity-50 disabled:pointer-events-none`}
                disabled={!!selectedOption}
                onClick={() => handleApproval(opt)}
              >
                {selectedOption === opt && !approvalSent ? '…' : opt}
              </button>
            ))}
          </div>
          {approvalSent && <div className="mt-2 text-[11px] text-emerald-400 font-semibold">✓ Response submitted</div>}
        </div>
      ) : isShowForm ? (
        <div className="mt-2.5 p-3.5 bg-surface-2 border border-border rounded-lg">
          <div className="text-sm text-text mb-2 leading-snug">
            Form: <span className="font-mono text-accent">{showFormId}</span>
            {(a.payload.formVersion ?? a.payload.FormVersion) ? (
              <span className="text-text-dim ml-2 text-[11px]">
                v{String(a.payload.formVersion ?? a.payload.FormVersion)}
              </span>
            ) : null}
          </div>
          <button
            onClick={handleOpenForm}
            disabled={formTokenLoading}
            className="w-full py-2 rounded-md border-none bg-accent text-white text-sm font-semibold cursor-pointer hover:bg-[#3d7ae8] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {formTokenLoading ? 'Loading…' : '📝 Fill Form'}
          </button>
        </div>
      ) : a.payload ? (
        <PayloadBlock label="Show payload" data={a.payload} />
      ) : null}

      {a.payload ? <PayloadBlock label="Show payload" data={a.payload} /> : null}

      {isPatchable && !isApproval && !isShowForm && (
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          <button
            className="px-2.5 py-1 rounded-md border border-emerald-400 bg-surface-2 text-emerald-400 text-[11px] font-semibold uppercase tracking-wide cursor-pointer hover:border-accent hover:text-accent transition-all duration-150 disabled:opacity-50"
            disabled={!!patching}
            onClick={() => handlePatch('in_progress')}
          >
            {patching === 'in_progress' ? '…' : '▶ In Progress'}
          </button>
          <button
            className="px-2.5 py-1 rounded-md border border-emerald-400 bg-surface-2 text-emerald-400 text-[11px] font-semibold uppercase tracking-wide cursor-pointer hover:border-accent hover:text-accent transition-all duration-150 disabled:opacity-50"
            disabled={!!patching}
            onClick={() => handlePatch('completed')}
          >
            {patching === 'completed' ? '…' : '✓ Complete'}
          </button>
          <button
            className="px-2.5 py-1 rounded-md border border-red-400 bg-surface-2 text-red-400 text-[11px] font-semibold uppercase tracking-wide cursor-pointer hover:border-red-500 hover:text-red-500 transition-all duration-150 disabled:opacity-50"
            disabled={!!patching}
            onClick={() => handlePatch('cancelled')}
          >
            {patching === 'cancelled' ? '…' : '✕ Cancel'}
          </button>
        </div>
      )}

      {/* ── CHEFS Form Modal for showform actions ── */}
      {formModalOpen && formToken && showFormId && (
        <ChefsFormModal
          formId={showFormId}
          formName={formName ?? undefined}
          token={formToken}
          onClose={() => {
            setFormModalOpen(false);
            setFormToken(null);
            setFormName(null);
          }}
          onSubmitted={handleFormSubmitted}
        />
      )}
    </div>
  );
}
