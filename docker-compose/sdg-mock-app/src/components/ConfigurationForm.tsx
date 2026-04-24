'use client';

import { useState } from 'react';
import type { PlaygroundDetail, FormEntry, UpdatePlaygroundRequest } from '@/types/playground';
import { updatePlayground } from '@/lib/api';
import FormEntryEditor from '@/components/FormEntryEditor';

interface ConfigurationFormProps {
  name: string;
  detail: PlaygroundDetail;
  onSaved: () => void;
}

const EMPTY_FORM_ENTRY: FormEntry = {
  formId: '',
  formName: '',
  apiKey: '',
  allowedActors: ['*'],
  callbackWebhookUrl: '',
};

export default function ConfigurationForm({ name, detail, onSaved }: Readonly<ConfigurationFormProps>) {
  const [n8nTarget, setN8nTarget] = useState(detail.n8nTarget);
  const [xN8nApiKey, setXN8nApiKey] = useState(detail.xN8nApiKey);
  const [tenantId, setTenantId] = useState(detail.tenantId);
  const [chefsBaseUrl, setChefsBaseUrl] = useState(detail.chefsBaseUrl);
  const [forms, setForms] = useState<FormEntry[]>(detail.forms);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleFormChange(index: number, updated: FormEntry) {
    setForms((prev) => prev.map((f, i) => (i === index ? updated : f)));
  }

  function handleFormRemove(index: number) {
    setForms((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAddForm() {
    setForms((prev) => [...prev, { ...EMPTY_FORM_ENTRY, allowedActors: ['*'] }]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const data: UpdatePlaygroundRequest = {
        n8nTarget,
        xN8nApiKey,
        tenantId,
        chefsBaseUrl,
        forms,
      };
      await updatePlayground(name, data);
      setSuccess(true);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Credential fields */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-text mb-4">WIL / n8n Credentials</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cfg-n8n-target" className="block text-xs font-medium text-text-muted mb-1">
              N8N_TARGET
            </label>
            <input
              id="cfg-n8n-target"
              type="text"
              className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
              value={n8nTarget}
              onChange={(e) => setN8nTarget(e.target.value)}
              placeholder="e.g. http://n8n:5678"
            />
          </div>
          <div>
            <label htmlFor="cfg-api-key" className="block text-xs font-medium text-text-muted mb-1">
              X_N8N_API_KEY
            </label>
            <input
              id="cfg-api-key"
              type="password"
              className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
              value={xN8nApiKey}
              onChange={(e) => setXN8nApiKey(e.target.value)}
              placeholder="API key"
            />
          </div>
          <div>
            <label htmlFor="cfg-tenant-id" className="block text-xs font-medium text-text-muted mb-1">
              X_TENANT_ID
            </label>
            <input
              id="cfg-tenant-id"
              type="text"
              className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="e.g. tenant-abc"
            />
          </div>
          <div>
            <label htmlFor="cfg-chefs-url" className="block text-xs font-medium text-text-muted mb-1">
              CHEFS_BASE_URL
            </label>
            <input
              id="cfg-chefs-url"
              type="text"
              className="w-full px-3 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
              value={chefsBaseUrl}
              onChange={(e) => setChefsBaseUrl(e.target.value)}
              placeholder="e.g. https://submit.digital.gov.bc.ca/app"
            />
          </div>
        </div>
      </div>

      {/* Form entries */}
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">CHEFS Form Entries</h3>
          <button
            type="button"
            onClick={handleAddForm}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-surface-2 text-text text-xs font-medium hover:border-accent/40 transition-all duration-150"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Form
          </button>
        </div>

        {forms.length === 0 ? (
          <p className="text-xs text-text-muted py-4 text-center">
            No form entries yet. Click &quot;Add Form&quot; to add one.
          </p>
        ) : (
          <div className="space-y-3">
            {forms.map((entry, i) => (
              <FormEntryEditor
                key={entry.formId || `new-form-${i}`}
                entry={entry}
                index={i}
                onChange={handleFormChange}
                onRemove={handleFormRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status messages */}
      {error && <div className="px-4 py-2.5 rounded-md bg-red-soft text-red-400 text-sm">{error}</div>}
      {success && (
        <div className="px-4 py-2.5 rounded-md bg-green-900/20 text-green-400 text-sm">
          Configuration saved successfully.
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={saving}
          className={`px-5 py-2 rounded-md bg-accent text-white text-sm font-medium hover:bg-[#3d7ae8] transition-all duration-150 ${saving ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {saving ? 'Saving…' : 'Save Configuration'}
        </button>
      </div>
    </form>
  );
}
