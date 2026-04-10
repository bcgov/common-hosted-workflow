'use client';

import { useEffect, useRef } from 'react';
import type { FormConfig } from '@/lib/api';

interface Props {
  open: boolean;
  config: FormConfig;
  onSave: (cfg: FormConfig) => void;
  onClose: () => void;
}

export default function FormSettingsModal({ open, config, onSave, onClose }: Props) {
  const webhookRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && webhookRef.current) {
      webhookRef.current.value = config.webhookUrl;
    }
  }, [open, config]);

  const handleSave = () => {
    onSave({
      webhookUrl: (webhookRef.current?.value ?? '').replace(/\/+$/, ''),
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="bg-surface border border-border rounded-[14px] w-[440px] max-w-[90vw] shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">📋 Form Webhook Settings</h3>
          <button className="bg-transparent border-none text-text-muted text-xl cursor-pointer p-1" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="p-5">
          <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
            Application Webhook URL
          </label>
          <input
            ref={webhookRef}
            type="text"
            placeholder="http://localhost:5678/webhook/..."
            className="w-full px-3 py-2.5 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
          />
          <p className="text-[11px] text-text-dim mt-1">
            POST endpoint for the application form. Actor ID is appended automatically.
          </p>
        </div>
        <div className="px-5 py-3.5 border-t border-border flex justify-end gap-2">
          <button
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-surface-2 text-text text-sm font-medium cursor-pointer hover:border-border-hover hover:bg-surface-3 transition-all duration-150"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-accent bg-accent text-white text-sm font-medium cursor-pointer hover:bg-[#3d7ae8] transition-all duration-150"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
