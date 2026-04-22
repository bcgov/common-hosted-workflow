'use client';

import { useState, useRef } from 'react';
import { validatePlaygroundName, validateImportPayload } from '@/lib/validation';
import { importPlayground } from '@/lib/api';
import type { PlaygroundExport } from '@/types/playground';

interface ImportPlaygroundDialogProps {
  owner: string;
  onImported: (name: string) => void;
  onClose: () => void;
}

export default function ImportPlaygroundDialog({ owner, onImported, onClose }: ImportPlaygroundDialogProps) {
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [config, setConfig] = useState<PlaygroundExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const validation = validateImportPayload(parsed);
        if (!validation.valid) {
          setError(validation.error ?? 'Invalid file structure');
          setConfig(null);
          return;
        }
        setConfig(parsed as PlaygroundExport);
      } catch {
        setError('File is not valid JSON');
        setConfig(null);
      }
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();

    const nameResult = validatePlaygroundName(trimmed);
    if (!nameResult.valid) {
      setError(nameResult.error ?? 'Invalid name');
      return;
    }
    if (!config) {
      setError('Please select a valid JSON file');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await importPlayground(trimmed, owner, config);
      onImported(trimmed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import playground';
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
        <h2 className="text-lg font-semibold text-text mb-1">Import Playground</h2>
        <p className="text-xs text-text-muted mb-5">
          Select an exported playground JSON file and choose a name for the import.
        </p>
        <form onSubmit={handleSubmit}>
          {/* File picker */}
          <label htmlFor="import-file" className="block text-xs font-medium text-text-muted mb-1.5">
            JSON File
          </label>
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={submitting}
              className="px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-xs font-medium hover:border-accent/40 transition-all duration-150"
            >
              Choose File
            </button>
            <span className="text-xs text-text-muted truncate">{fileName ?? 'No file selected'}</span>
            <input
              ref={fileRef}
              id="import-file"
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
              disabled={submitting}
            />
          </div>

          {/* Name input */}
          <label htmlFor="import-name" className="block text-xs font-medium text-text-muted mb-1.5">
            Playground Name
          </label>
          <input
            id="import-name"
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. imported-env"
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
              disabled={submitting || !config}
              className={`px-4 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-[#3d7ae8] transition-all duration-150 ${submitting || !config ? 'opacity-60 pointer-events-none' : ''}`}
            >
              {submitting ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
