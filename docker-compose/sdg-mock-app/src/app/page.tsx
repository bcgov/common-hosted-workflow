'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getTesterName, setTesterName, clearTesterName } from '@/lib/tester-identity';
import { validatePlaygroundName } from '@/lib/validation';
import { fetchPlaygrounds, deletePlayground, clonePlayground } from '@/lib/api';
import type { PlaygroundSummary } from '@/types/playground';
import TesterIdentityPrompt from '@/components/TesterIdentityPrompt';
import PlaygroundList from '@/components/PlaygroundList';
import CreatePlaygroundDialog from '@/components/CreatePlaygroundDialog';
import ImportPlaygroundDialog from '@/components/ImportPlaygroundDialog';

export default function LandingPage() {
  const router = useRouter();
  const [testerName, setTesterNameState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [playgrounds, setPlaygrounds] = useState<PlaygroundSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [clonePrompt, setClonePrompt] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  // Read tester name from localStorage on mount
  useEffect(() => {
    const stored = getTesterName();
    setTesterNameState(stored);
    setInitialized(true);
  }, []);

  const loadPlaygrounds = useCallback(async (owner: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchPlaygrounds(owner);
      setPlaygrounds(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load playgrounds');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch playgrounds when tester name is set
  useEffect(() => {
    if (testerName) {
      loadPlaygrounds(testerName);
    }
  }, [testerName, loadPlaygrounds]);

  function handleIdentityComplete(name: string) {
    setTesterNameState(name);
  }

  function handleSwitchUser() {
    clearTesterName();
    setTesterNameState(null);
    setPlaygrounds([]);
  }

  async function handleDelete(name: string) {
    try {
      await deletePlayground(name);
      if (testerName) {
        await loadPlaygrounds(testerName);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete playground');
    }
  }

  function handleCloneStart(name: string) {
    setClonePrompt(name);
    setCloneName('');
    setCloneError(null);
  }

  async function handleCloneSubmit() {
    if (!clonePrompt || !testerName) return;
    const trimmed = cloneName.trim();
    const result = validatePlaygroundName(trimmed);
    if (!result.valid) {
      setCloneError(result.error ?? 'Invalid name');
      return;
    }
    setCloneError(null);
    setCloning(true);
    try {
      await clonePlayground(clonePrompt, trimmed, testerName);
      setClonePrompt(null);
      router.push(`/playground/${encodeURIComponent(trimmed)}/configuration`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to clone playground';
      if (msg.includes('409')) {
        setCloneError('A playground with this name already exists.');
      } else {
        setCloneError(msg);
      }
    } finally {
      setCloning(false);
    }
  }

  function handleCreated(name: string) {
    setShowCreate(false);
    router.push(`/playground/${encodeURIComponent(name)}/configuration`);
  }

  function handleImported(name: string) {
    setShowImport(false);
    router.push(`/playground/${encodeURIComponent(name)}/configuration`);
  }

  // Don't render until we've checked localStorage
  if (!initialized) return null;

  // Show identity prompt if no tester name
  if (!testerName) {
    return <TesterIdentityPrompt onComplete={handleIdentityComplete} />;
  }

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-7 py-4 border-b border-border bg-surface sticky top-0 z-50">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center font-bold text-[15px] text-white">
            C
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">SDG Playground</div>
            <div className="text-xs text-text-muted mt-px">Multi-tenant testing platform</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span className="font-mono text-xs">{testerName}</span>
            <button type="button" onClick={handleSwitchUser} className="text-xs text-accent hover:underline">
              Switch User
            </button>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap px-7 py-3.5 border-b border-border bg-surface">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-accent bg-accent text-white text-[13px] font-medium hover:bg-[#3d7ae8] transition-all duration-150"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[15px]">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create New Playground
        </button>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-surface-2 text-text text-[13px] font-medium hover:border-accent/40 transition-all duration-150"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[15px]">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Import Playground
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => loadPlaygrounds(testerName)}
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
      </div>

      {/* ── Content ── */}
      <div className="px-7 py-6">
        {error && <div className="mb-4 px-4 py-2.5 rounded-md bg-red-soft text-red-400 text-sm">{error}</div>}
        <PlaygroundList playgrounds={playgrounds} onDelete={handleDelete} onClone={handleCloneStart} />
      </div>

      {/* ── Dialogs ── */}
      {showCreate && (
        <CreatePlaygroundDialog owner={testerName} onCreated={handleCreated} onClose={() => setShowCreate(false)} />
      )}
      {showImport && (
        <ImportPlaygroundDialog owner={testerName} onImported={handleImported} onClose={() => setShowImport(false)} />
      )}
      {clonePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-text mb-1">Clone Playground</h2>
            <p className="text-xs text-text-muted mb-5">
              Enter a new name for the cloned copy of <span className="font-mono font-medium">{clonePrompt}</span>.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCloneSubmit();
              }}
            >
              <label htmlFor="clone-name" className="block text-xs font-medium text-text-muted mb-1.5">
                New Playground Name
              </label>
              <input
                id="clone-name"
                type="text"
                className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
                value={cloneName}
                onChange={(e) => {
                  setCloneName(e.target.value);
                  if (cloneError) setCloneError(null);
                }}
                placeholder="e.g. my-clone"
                autoFocus
                disabled={cloning}
              />
              {cloneError && <p className="mt-1.5 text-xs text-red-400">{cloneError}</p>}
              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setClonePrompt(null)}
                  disabled={cloning}
                  className="px-4 py-2 rounded-md border border-border text-text text-sm font-medium hover:border-accent/40 transition-all duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cloning}
                  className={`px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-[#3d7ae8] transition-all duration-150 ${cloning ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  {cloning ? 'Cloning…' : 'Clone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
