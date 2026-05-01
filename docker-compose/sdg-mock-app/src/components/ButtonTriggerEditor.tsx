'use client';

import type { ButtonTrigger } from '@/types/playground';

interface ButtonTriggerEditorProps {
  trigger: ButtonTrigger;
  index: number;
  onChange: (index: number, trigger: ButtonTrigger) => void;
  onRemove: (index: number) => void;
}

export default function ButtonTriggerEditor({
  trigger,
  index,
  onChange,
  onRemove,
}: Readonly<ButtonTriggerEditorProps>) {
  function handleField(field: keyof ButtonTrigger, value: string | boolean) {
    onChange(index, { ...trigger, [field]: value });
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">Button #{index + 1}</span>
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
          <label htmlFor={`btn-text-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            Button Text
          </label>
          <input
            id={`btn-text-${index}`}
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm focus:outline-none focus:border-accent"
            value={trigger.buttonText}
            onChange={(e) => handleField('buttonText', e.target.value)}
            placeholder="e.g. Submit Disability Application"
          />
        </div>
        <div>
          <label htmlFor={`btn-method-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            Request Method
          </label>
          <select
            id={`btn-method-${index}`}
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm focus:outline-none focus:border-accent"
            value={trigger.method}
            onChange={(e) => handleField('method', e.target.value)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`btn-webhook-${index}`} className="block text-xs font-medium text-text-muted mb-1">
            Webhook URL
          </label>
          <input
            id={`btn-webhook-${index}`}
            type="text"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono focus:outline-none focus:border-accent"
            value={trigger.webhookUrl}
            onChange={(e) => handleField('webhookUrl', e.target.value)}
            placeholder="e.g. http://n8n:5678/webhook/my-trigger"
          />
        </div>
        {trigger.method === 'POST' && (
          <div className="sm:col-span-2">
            <label htmlFor={`btn-body-${index}`} className="block text-xs font-medium text-text-muted mb-1">
              POST Body (optional JSON)
            </label>
            <textarea
              id={`btn-body-${index}`}
              className="w-full px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono focus:outline-none focus:border-accent resize-y"
              rows={3}
              value={trigger.postBody}
              onChange={(e) => handleField('postBody', e.target.value)}
              placeholder='e.g. {"time": "today"}'
            />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border bg-surface text-accent focus:ring-accent"
              checked={trigger.includeActorId}
              onChange={(e) => handleField('includeActorId', e.target.checked)}
            />
            <span className="text-xs font-medium text-text-muted">Include Actor ID in request</span>
          </label>
          <p className="text-[11px] text-text-dim mt-1 ml-6">
            {trigger.method === 'POST' ? 'Adds "actorId" field to the JSON body' : 'Appends ?actorId=... to the URL'}
          </p>
        </div>
      </div>
    </div>
  );
}
