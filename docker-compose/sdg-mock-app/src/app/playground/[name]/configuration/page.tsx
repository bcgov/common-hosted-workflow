'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { PlaygroundDetail } from '@/types/playground';
import { fetchPlayground, exportPlayground, setPlaygroundContext } from '@/lib/api';
import PlaygroundHeader from '@/components/PlaygroundHeader';
import ConfigurationForm from '@/components/ConfigurationForm';
import ConnectionTestButton from '@/components/ConnectionTestButton';

export default function ConfigurationPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = React.use(params);
  const router = useRouter();

  const [detail, setDetail] = useState<PlaygroundDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Set playground context on mount
  useEffect(() => {
    setPlaygroundContext(name);
    return () => setPlaygroundContext(null);
  }, [name]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlayground(name);
      setDetail(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load playground';
      if (msg.includes('404')) {
        router.push('/');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [name, router]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportPlayground(name);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `playground-${name}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export playground');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <>
        <PlaygroundHeader playgroundName={name} activeTab="configuration" />
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-text-muted">Loading configuration…</div>
        </div>
      </>
    );
  }

  if (error && !detail) {
    return (
      <>
        <PlaygroundHeader playgroundName={name} activeTab="configuration" />
        <div className="px-7 py-6">
          <div className="px-4 py-2.5 rounded-md bg-red-soft text-red-400 text-sm">{error}</div>
        </div>
      </>
    );
  }

  if (!detail) return null;

  return (
    <>
      <PlaygroundHeader playgroundName={name} activeTab="configuration" />

      <div className="px-7 py-6 max-w-4xl mx-auto space-y-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">Configuration</h2>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-surface-2 text-text text-[13px] font-medium hover:border-accent/40 transition-all duration-150 ${exporting ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-[15px]">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? 'Exporting…' : 'Download as JSON'}
          </button>
        </div>

        {error && <div className="px-4 py-2.5 rounded-md bg-red-soft text-red-400 text-sm">{error}</div>}

        {/* Configuration form */}
        <ConfigurationForm name={name} detail={detail} onSaved={loadDetail} />

        {/* Connection test */}
        <ConnectionTestButton playgroundName={name} />
      </div>
    </>
  );
}
