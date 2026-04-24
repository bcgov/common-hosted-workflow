'use client';

import { useState } from 'react';
import { validateTesterName } from '@/lib/validation';
import { setTesterName } from '@/lib/tester-identity';

interface TesterIdentityPromptProps {
  onComplete: (name: string) => void;
}

export default function TesterIdentityPrompt({ onComplete }: Readonly<TesterIdentityPromptProps>) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const result = validateTesterName(trimmed);
    if (!result.valid) {
      setError(result.error ?? 'Invalid name');
      return;
    }
    setError(null);
    setTesterName(trimmed);
    onComplete(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center font-bold text-[15px] text-white">
            C
          </div>
          <h2 className="text-lg font-semibold text-text">Welcome to SDG Playground</h2>
        </div>
        <p className="text-sm text-text-muted mb-5">
          Enter your name to get started. This identifies your playgrounds.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="tester-name" className="block text-xs font-medium text-text-muted mb-1.5">
            Your Name
          </label>
          <input
            id="tester-name"
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. alice"
            autoFocus
          />
          {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            className="mt-4 w-full px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-[#3d7ae8] transition-all duration-150"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
