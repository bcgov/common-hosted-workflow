'use client';

import { useState } from 'react';
import { validatePlaygroundName } from '@/lib/validation';
import { createPlayground } from '@/lib/api';

interface CreatePlaygroundDialogProps {
  owner: string;
  onCreated: (name: string) => void;
  onClose: () => void;
}

export default function CreatePlaygroundDialog({ owner, onCreated, onClose }: Readonly<CreatePlaygroundDialogProps>) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const result = validatePlaygroundName(trimmed);
    if (!result.valid) {
      setError(result.error ?? 'Invalid name');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createPlayground({ name: trimmed, owner });
      onCreated(trimmed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create playground';
      if (msg.includes('409')) {
        setError('A playground with this name already exists.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text mb-1">Create New Playground</h2>
        <p className="text-xs text-text-muted mb-5">
          Choose a unique name. Lowercase letters, numbers, hyphens, and underscores only.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="playground-name" className="block text-xs font-medium text-text-muted mb-1.5">
            Playground Name
          </label>
          <input
            id="playground-name"
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. my-test-env"
            autoFocus
            disabled={submitting}
          />
          {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          <div className="flex items-center justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-md border border-border text-text text-sm font-medium hover:border-accent/40 transition-all duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-[#3d7ae8] transition-all duration-150 ${submitting ? 'opacity-60 pointer-events-none' : ''}`}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
