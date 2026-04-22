'use client';

import { useState } from 'react';
import type { ConnectionTestResult } from '@/types/playground';
import { testConnection } from '@/lib/api';

interface ConnectionTestButtonProps {
  playgroundName: string;
}

export default function ConnectionTestButton({ playgroundName }: ConnectionTestButtonProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    setError(null);
    try {
      const res = await testConnection(playgroundName);
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Connection Test</h3>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-xs font-medium hover:border-accent/40 transition-all duration-150 ${testing ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {testing ? (
            <>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="size-3.5 animate-spin"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Testing…
            </>
          ) : (
            'Test Connection'
          )}
        </button>
      </div>

      <p className="text-xs text-text-muted mb-3">
        Verify connectivity to the configured n8n instance using the saved credentials.
      </p>

      {/* Result display */}
      {result && (
        <div
          className={`px-4 py-2.5 rounded-md text-sm ${
            result.success ? 'bg-green-900/20 text-green-400' : 'bg-red-soft text-red-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{result.success ? 'Success' : 'Failed'}</span>
            {result.status != null && <span className="text-xs opacity-75">HTTP {result.status}</span>}
            {result.responseTimeMs != null && <span className="text-xs opacity-75">{result.responseTimeMs}ms</span>}
          </div>
          <p className="mt-1 text-xs opacity-90">{result.message}</p>
        </div>
      )}

      {/* Error display */}
      {error && <div className="px-4 py-2.5 rounded-md bg-red-soft text-red-400 text-sm">{error}</div>}
    </div>
  );
}
