'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchPlayground } from '@/lib/api';
import { useDashboard } from '@/hooks/useDashboard';
import { ToastProvider } from '@/components/Toast';
import PlaygroundHeader from '@/components/PlaygroundHeader';
import FormsPanel from '@/components/FormsPanel';
import MessagesPanel from '@/components/MessagesPanel';
import ActionsPanel from '@/components/ActionsPanel';

function ActorIdField({ actorId, onSave }: Readonly<{ actorId: string; onSave: (value: string) => void }>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(actorId);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed) {
      onSave(trimmed);
    } else {
      setDraft(actorId);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setDraft(actorId);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          id="actor-id"
          type="text"
          className="w-36 px-2.5 py-1.5 rounded-md border border-accent bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder="e.g. amina"
        />
        <button
          type="button"
          onClick={handleSave}
          className="p-1 rounded hover:bg-surface-2 text-accent"
          aria-label="Save actor ID"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="px-2.5 py-1.5 text-sm font-mono text-text">{actorId}</span>
      <button
        type="button"
        onClick={() => {
          setDraft(actorId);
          setEditing(true);
        }}
        className="p-1 rounded hover:bg-surface-2 text-text-muted hover:text-accent"
        aria-label="Edit actor ID"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
    </div>
  );
}

function UserTestContent({ name }: Readonly<{ name: string }>) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  // Verify playground exists on mount; redirect if not found
  useEffect(() => {
    fetchPlayground(name)
      .then(() => setVerified(true))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404')) {
          router.push('/');
        } else {
          // Still show the page on non-404 errors
          setVerified(true);
        }
      });
  }, [name, router]);

  const {
    loading,
    lastRefresh,
    actorId,
    setActorId,
    since,
    setSince,
    limit,
    setLimit,
    messages,
    msgError,
    actions,
    actError,
    refresh,
  } = useDashboard(name);

  if (!verified) {
    return (
      <>
        <PlaygroundHeader playgroundName={name} activeTab="user-test" />
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-text-muted">Loading playground…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <PlaygroundHeader playgroundName={name} activeTab="user-test" />

      {/* ── Controls Bar ── */}
      <div className="flex items-center gap-3 flex-wrap px-7 py-3.5 border-b border-border bg-surface sticky top-[57px] z-40">
        <label className="flex items-center gap-1.5 text-xs text-text-muted font-medium" htmlFor="actor-id">
          Actor ID
        </label>
        <ActorIdField actorId={actorId} onSave={setActorId} />

        <label className="flex items-center gap-1.5 text-xs text-text-muted font-medium ml-2" htmlFor="since">
          Since
        </label>
        <input
          id="since"
          type="datetime-local"
          className="px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-sm focus:outline-none focus:border-accent"
          value={since}
          onChange={(e) => setSince(e.target.value)}
        />

        <label className="flex items-center gap-1.5 text-xs text-text-muted font-medium ml-2" htmlFor="limit">
          Limit
        </label>
        <input
          id="limit"
          type="number"
          className="w-20 px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value) || 50)}
          min={1}
          max={500}
        />

        <div className="flex-1" />

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-surface-2 text-text text-[13px] font-medium hover:border-accent/40 transition-all duration-150 ${loading ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`size-[15px] ${loading ? 'animate-spin' : ''}`}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>

        {lastRefresh && <span className="text-[11px] text-text-dim font-mono">Last: {lastRefresh}</span>}
      </div>

      {/* ── Three-Panel Dashboard Grid ── */}
      <div className="grid grid-cols-[280px_1fr_1fr] flex-1 min-h-0 overflow-hidden">
        <FormsPanel actorId={actorId} onRefresh={refresh} />
        <MessagesPanel messages={messages} error={msgError} />
        <ActionsPanel actions={actions} error={actError} actorId={actorId} onRefresh={refresh} />
      </div>
    </>
  );
}

export default function UserTestPage({ params }: Readonly<{ params: Promise<{ name: string }> }>) {
  const { name } = React.use(params);

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-bg text-text">
        <UserTestContent name={name} />
      </div>
    </ToastProvider>
  );
}
