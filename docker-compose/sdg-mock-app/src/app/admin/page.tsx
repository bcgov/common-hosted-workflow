'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { deletePlayground } from '@/lib/api';

interface PlaygroundInfo {
  name: string;
  n8nTarget: string;
  tenantId: string;
  chefsBaseUrl: string;
  formCount: number;
  createdAt: string;
  updatedAt: string;
}

interface OwnerGroup {
  owner: string;
  playgrounds: PlaygroundInfo[];
}

interface PlaygroundRowProps {
  pg: PlaygroundInfo;
  deleting: string | null;
  onDelete: (name: string) => void;
}

function PlaygroundRow({ pg, deleting, onDelete }: Readonly<PlaygroundRowProps>) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border last:border-b-0 hover:bg-surface-2/50 transition-colors duration-100">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{pg.name}</div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-text-dim font-mono flex-wrap">
          <span title="n8n target">{pg.n8nTarget || '(no target)'}</span>
          <span>·</span>
          <span>
            {pg.formCount} form{pg.formCount === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>created {pg.createdAt}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <Link
          href={`/playground/${encodeURIComponent(pg.name)}/configuration`}
          className="px-2.5 py-1 rounded-md border border-border bg-surface-2 text-text text-[11px] font-medium hover:border-accent/40 transition-all duration-150"
        >
          View
        </Link>
        <Link
          href={`/playground/${encodeURIComponent(pg.name)}/user-test`}
          className="px-2.5 py-1 rounded-md border border-accent bg-accent-soft text-accent text-[11px] font-medium hover:bg-accent hover:text-white transition-all duration-150"
        >
          Test
        </Link>
        <button
          type="button"
          onClick={() => onDelete(pg.name)}
          disabled={deleting === pg.name}
          className="px-2.5 py-1 rounded-md border border-red-400/40 text-red-400 text-[11px] font-medium hover:bg-red-400/10 transition-all duration-150 disabled:opacity-50"
        >
          {deleting === pg.name ? '…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [owners, setOwners] = useState<OwnerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/admin/playgrounds');
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      setOwners(data.owners);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleOwner = (owner: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete playground "${name}"? This cannot be undone.`)) return;
    setDeleting(name);
    try {
      await deletePlayground(name);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  const totalPlaygrounds = owners.reduce((sum, o) => sum + o.playgrounds.length, 0);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <div className="flex items-center justify-between px-7 py-4 border-b border-border bg-surface sticky top-0 z-50">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center font-bold text-[15px] text-white">
            A
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">Admin Dashboard</div>
            <div className="text-xs text-text-muted mt-px">All users and playgrounds</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="px-3 py-1.5 rounded-md border border-border bg-surface-2 text-text-muted text-xs font-medium hover:border-accent/40 transition-all duration-150"
          >
            ← Back to Playgrounds
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-surface-2 text-text text-[13px] font-medium hover:border-accent/40 transition-all duration-150 ${loading ? 'opacity-60 pointer-events-none' : ''}`}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-6 px-7 py-3 border-b border-border bg-surface text-xs text-text-muted">
        <span>
          {owners.length} user{owners.length === 1 ? '' : 's'}
        </span>
        <span>
          {totalPlaygrounds} playground{totalPlaygrounds === 1 ? '' : 's'}
        </span>
      </div>

      {/* Content */}
      <div className="px-7 py-6 max-w-5xl">
        {error && <div className="mb-4 px-4 py-2.5 rounded-md bg-red-soft text-red-400 text-sm">{error}</div>}

        {(() => {
          if (loading && owners.length === 0) {
            return <div className="text-sm text-text-muted text-center py-12">Loading…</div>;
          }
          if (owners.length === 0) {
            return (
              <div className="text-sm text-text-muted text-center py-12">No playgrounds found in the database.</div>
            );
          }
          return (
            <div className="space-y-4">
              {owners.map((group) => (
                <div key={group.owner} className="rounded-lg border border-border bg-surface overflow-hidden">
                  {/* Owner header */}
                  <button
                    type="button"
                    onClick={() => toggleOwner(group.owner)}
                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-2 transition-colors duration-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent-soft flex items-center justify-center text-accent text-sm font-bold uppercase">
                        {group.owner.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold">{group.owner}</div>
                        <div className="text-[11px] text-text-muted">
                          {group.playgrounds.length} playground{group.playgrounds.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`size-4 text-text-muted transition-transform duration-150 ${collapsed.has(group.owner) ? '' : 'rotate-180'}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Playground list */}
                  {!collapsed.has(group.owner) && (
                    <div className="border-t border-border">
                      {group.playgrounds.map((pg) => (
                        <PlaygroundRow key={pg.name} pg={pg} deleting={deleting} onDelete={handleDelete} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
