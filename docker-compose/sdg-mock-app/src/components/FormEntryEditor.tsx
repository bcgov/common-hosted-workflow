'use client';

import type { FormEntry } from '@/types/playground';

interface FormEntryEditorProps {
  entry: FormEntry;
  index: number;
  onChange: (index: number, entry: FormEntry) => void;
  onRemove: (index: number) => void;
}

export default function FormEntryEditor({ entry, index, onChange, onRemove }: Readonly<FormEntryEditorProps>) {
  function handleField(field: keyof FormEntry, value: string) {
    if (field === 'allowedActors') {
      onChange(index, {
        ...entry,
        allowedActors: value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    } else {
      onChange(index, { ...entry, [field]: value });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Form #{index + 1}</span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="px-2.5 py-1 rounded-md border border-border text-red-400 text-xs font-medium hover:bg-red-soft transition-all duration-150"
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor={`form-id-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            Form ID
          </label>
          <input
            id={`form-id-${index}`}
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={entry.formId}
            onChange={(e) => handleField('formId', e.target.value)}
            placeholder="e.g. abc123-def456"
          />
        </div>
        <div>
          <label htmlFor={`form-name-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            Form Name
          </label>
          <input
            id={`form-name-${index}`}
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={entry.formName}
            onChange={(e) => handleField('formName', e.target.value)}
            placeholder="e.g. My CHEFS Form"
          />
        </div>
        <div>
          <label htmlFor={`form-apikey-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            API Key
          </label>
          <input
            id={`form-apikey-${index}`}
            type="password"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={entry.apiKey}
            onChange={(e) => handleField('apiKey', e.target.value)}
            placeholder="Form API key"
          />
        </div>
        <div>
          <label htmlFor={`form-actors-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            Allowed Actors
          </label>
          <input
            id={`form-actors-${index}`}
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={entry.allowedActors.join(', ')}
            onChange={(e) => handleField('allowedActors', e.target.value)}
            placeholder="* or comma-separated actor IDs"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`form-webhook-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            Callback Webhook URL
          </label>
          <input
            id={`form-webhook-${index}`}
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={entry.callbackWebhookUrl}
            onChange={(e) => handleField('callbackWebhookUrl', e.target.value)}
            placeholder="e.g. http://n8n:5678/webhook/..."
          />
        </div>
      </div>
    </div>
  );
}
