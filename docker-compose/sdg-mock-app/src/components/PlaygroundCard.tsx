'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PlaygroundSummary } from '@/types/playground';
import { fmtDate } from '@/lib/api';

interface PlaygroundCardProps {
  playground: PlaygroundSummary;
  onDelete: (name: string) => void;
  onClone: (name: string) => void;
}

export default function PlaygroundCard({ playground, onDelete, onClone }: PlaygroundCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface p-5 hover:border-accent/40 transition-colors duration-150">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <Link
          href={`/playground/${encodeURIComponent(playground.name)}/user-test`}
          className="text-base font-semibold text-text hover:text-accent transition-colors"
        >
          {playground.name}
        </Link>
        <Link
          href={`/playground/${encodeURIComponent(playground.name)}/configuration`}
          className="shrink-0 text-xs text-text-muted hover:text-accent transition-colors"
        >
          Configure →
        </Link>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-text-muted mb-3">
        <div>
          <span className="font-medium">n8n Target:</span>{' '}
          <span className="font-mono">{playground.n8nTarget || '—'}</span>
        </div>
        <div>
          <span className="font-medium">CHEFS Base:</span>{' '}
          <span className="font-mono">{playground.chefsBaseUrl || '—'}</span>
        </div>
        <div>
          <span className="font-medium">Tenant ID:</span>{' '}
          <span className="font-mono">{playground.tenantId || '—'}</span>
        </div>
        <div>
          <span className="font-medium">Forms:</span> {playground.formCount}
        </div>
      </div>

      {/* Timestamps */}
      <div className="flex items-center gap-4 text-[11px] text-text-muted mb-4">
        <span>Created: {fmtDate(playground.createdAt)}</span>
        <span>Updated: {fmtDate(playground.updatedAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Link
          href={`/playground/${encodeURIComponent(playground.name)}/user-test`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-accent bg-accent text-white text-xs font-medium hover:bg-[#3d7ae8] transition-all duration-150"
        >
          Open Dashboard
        </Link>
        <button
          type="button"
          onClick={() => onClone(playground.name)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-2 text-text text-xs font-medium hover:border-accent/40 transition-all duration-150"
        >
          Clone
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-red-400">Delete?</span>
            <button
              type="button"
              onClick={() => {
                onDelete(playground.name);
                setConfirmDelete(false);
              }}
              className="px-2.5 py-1.5 rounded-md bg-red-soft text-red-400 text-xs font-medium hover:bg-red-400/20 transition-all duration-150"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2.5 py-1.5 rounded-md border border-border text-text-muted text-xs font-medium hover:border-accent/40 transition-all duration-150"
            >
              No
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto px-3 py-1.5 rounded-md border border-border text-red-400 text-xs font-medium hover:bg-red-soft transition-all duration-150"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
