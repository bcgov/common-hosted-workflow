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

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`}>
      <div className="modal">
        <div className="modal-header">
          <h3>📋 Form Webhook Settings</h3>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Application Webhook URL</label>
            <input ref={webhookRef} type="text" placeholder="http://localhost:5678/webhook/..." />
            <div className="hint">POST endpoint for the application form. Actor ID is appended automatically.</div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
