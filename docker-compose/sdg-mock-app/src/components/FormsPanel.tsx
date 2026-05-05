'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChefsFormEntry, ButtonTriggerInfo } from '@/lib/api';
import {
  fetchChefsFormsForActor,
  fetchChefsToken,
  submitChefsForm,
  triggerButton,
  fetchButtonTriggers,
} from '@/lib/api';
import { useToast } from './Toast';
import ChefsFormModal from './ChefsFormModal';

interface Props {
  readonly actorId: string;
  readonly onRefresh: () => void;
}

export default function FormsPanel({ actorId, onRefresh }: Props) {
  const toast = useToast();

  // ── CHEFS forms state ──
  const [chefsForms, setChefsForms] = useState<ChefsFormEntry[]>([]);
  const [chefsLoading, setChefsLoading] = useState(false);
  const [chefsError, setChefsError] = useState<string | null>(null);

  // ── Button triggers state ──
  const [buttonTriggers, setButtonTriggers] = useState<ButtonTriggerInfo[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);
  const [triggeringId, setTriggeringId] = useState<number | null>(null);

  // ── Modal state ──
  const [modalFormId, setModalFormId] = useState<string | null>(null);
  const [modalFormName, setModalFormName] = useState<string | null>(null);
  const [modalToken, setModalToken] = useState<string | null>(null);
  const [modalChefsBaseUrl, setModalChefsBaseUrl] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState<string | null>(null);

  // Fetch CHEFS forms for the current actor
  useEffect(() => {
    if (!actorId.trim()) return;
    setChefsLoading(true);
    setChefsError(null);
    fetchChefsFormsForActor(actorId.trim())
      .then(setChefsForms)
      .catch((err) => setChefsError(err instanceof Error ? err.message : String(err)))
      .finally(() => setChefsLoading(false));
  }, [actorId]);

  // Fetch button triggers from dedicated endpoint (no secrets)
  useEffect(() => {
    setTriggersLoading(true);
    fetchButtonTriggers()
      .then(setButtonTriggers)
      .catch(() => setButtonTriggers([]))
      .finally(() => setTriggersLoading(false));
  }, []);

  // Open a CHEFS form in the modal
  const openChefsForm = useCallback(
    async (formId: string, formName: string) => {
      setTokenLoading(formId);
      try {
        const { authToken, chefsBaseUrl } = await fetchChefsToken(formId);
        setModalFormId(formId);
        setModalFormName(formName);
        setModalToken(authToken);
        setModalChefsBaseUrl(chefsBaseUrl);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        setTokenLoading(null);
      }
    },
    [toast],
  );

  const handleChefsSubmitted = useCallback(
    async (detail: unknown) => {
      if (!modalFormId) return;
      try {
        const submission = (detail as { submission?: unknown })?.submission ?? detail;
        await submitChefsForm(modalFormId, submission, actorId);
        toast('Form submitted successfully', 'success');
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      }
      setModalFormId(null);
      setModalFormName(null);
      setModalToken(null);
      setModalChefsBaseUrl(null);
      setTimeout(onRefresh, 2000);
    },
    [modalFormId, actorId, toast, onRefresh],
  );

  // Handle button trigger click
  const handleTriggerClick = useCallback(
    async (triggerId: number) => {
      if (!actorId.trim()) {
        toast('Please enter an Actor ID first', 'error');
        return;
      }
      setTriggeringId(triggerId);
      try {
        await triggerButton(triggerId, actorId.trim());
        toast('Webhook triggered successfully', 'success');
        setTimeout(onRefresh, 2000);
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error');
      } finally {
        setTriggeringId(null);
      }
    },
    [actorId, toast, onRefresh],
  );

  const isLoading = chefsLoading || triggersLoading;
  const isEmpty = !isLoading && !chefsError && chefsForms.length === 0 && buttonTriggers.length === 0;

  return (
    <div className="border-r border-border flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-surface sticky top-0 z-10">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
          <span className="text-base">⚡</span> Workflow Triggers
        </div>
      </div>
      <div className="flex-1 p-3 flex flex-col gap-2">
        {/* ── CHEFS Forms ── */}
        <ChefsForms
          loading={chefsLoading}
          error={chefsError}
          forms={chefsForms}
          tokenLoading={tokenLoading}
          onOpen={openChefsForm}
        />

        {/* ── Button Triggers ── */}
        <ButtonTriggers
          loading={triggersLoading}
          triggers={buttonTriggers}
          triggeringId={triggeringId}
          onTrigger={handleTriggerClick}
        />

        {/* ── Empty state ── */}
        {isEmpty && (
          <div className="text-xs text-text-dim text-center py-4">
            No workflow triggers configured for this playground
          </div>
        )}
      </div>

      {/* ── CHEFS Form Modal ── */}
      {modalFormId && modalToken && (
        <ChefsFormModal
          formId={modalFormId}
          formName={modalFormName ?? undefined}
          token={modalToken}
          chefsBaseUrl={modalChefsBaseUrl ?? undefined}
          onClose={() => {
            setModalFormId(null);
            setModalFormName(null);
            setModalToken(null);
            setModalChefsBaseUrl(null);
          }}
          onSubmitted={handleChefsSubmitted}
        />
      )}
    </div>
  );
}

/** Renders the CHEFS forms list. */
function ChefsForms({
  loading,
  error,
  forms,
  tokenLoading,
  onOpen,
}: Readonly<{
  loading: boolean;
  error: string | null;
  forms: ChefsFormEntry[];
  tokenLoading: string | null;
  onOpen: (formId: string, formName: string) => void;
}>) {
  if (loading) {
    return <div className="text-xs text-text-dim text-center py-4">Loading CHEFS forms…</div>;
  }
  if (error) {
    return <div className="text-xs text-red-400 text-center py-4">Failed to load CHEFS forms: {error}</div>;
  }
  if (forms.length === 0) {
    return null;
  }
  return (
    <>
      {forms.map((f) => (
        <div key={f.formId} className="bg-surface border border-border rounded-lg p-4 mb-1">
          <div className="text-[13px] font-semibold mb-1 flex items-center gap-1.5">📝 {f.formName}</div>
          <div className="text-[11px] text-text-dim font-mono mb-3">{f.formId}</div>
          <button
            onClick={() => onOpen(f.formId, f.formName)}
            disabled={tokenLoading === f.formId}
            className="w-full py-2 rounded-md border-none bg-accent text-white text-sm font-semibold cursor-pointer hover:bg-[#3d7ae8] transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tokenLoading === f.formId ? 'Loading…' : 'Fill Form'}
          </button>
        </div>
      ))}
    </>
  );
}

/** Renders the button triggers list. */
function ButtonTriggers({
  loading,
  triggers,
  triggeringId,
  onTrigger,
}: Readonly<{
  loading: boolean;
  triggers: ButtonTriggerInfo[];
  triggeringId: number | null;
  onTrigger: (triggerId: number) => void;
}>) {
  if (loading) {
    return <div className="text-xs text-text-dim text-center py-4">Loading triggers…</div>;
  }
  if (triggers.length === 0) {
    return null;
  }
  return (
    <>
      {triggers.map((trigger) => (
        <div key={trigger.id} className="bg-surface border border-border rounded-lg p-4 mb-1">
          <button
            onClick={() => onTrigger(trigger.id)}
            disabled={triggeringId === trigger.id}
            className="w-full py-2 rounded-md border-none bg-emerald-600 text-white text-sm font-semibold cursor-pointer hover:bg-emerald-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {triggeringId === trigger.id ? 'Triggering…' : trigger.buttonText || 'Trigger'}
          </button>
        </div>
      ))}
    </>
  );
}
