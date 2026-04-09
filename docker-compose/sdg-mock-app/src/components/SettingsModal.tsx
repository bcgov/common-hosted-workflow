'use client';

import { useEffect, useRef } from 'react';
import type { AppConfig } from '@/lib/api';

interface Props {
  open: boolean;
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
  onClose: () => void;
}

export default function SettingsModal({ open, config, onSave, onClose }: Props) {
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const tenantIdRef = useRef<HTMLInputElement>(null);
  const corsProxyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      if (baseUrlRef.current) baseUrlRef.current.value = config.baseUrl;
      if (apiKeyRef.current) apiKeyRef.current.value = config.apiKey;
      if (tenantIdRef.current) tenantIdRef.current.value = config.tenantId;
      if (corsProxyRef.current) corsProxyRef.current.value = config.corsProxy;
    }
  }, [open, config]);

  const handleSave = () => {
    onSave({
      baseUrl: (baseUrlRef.current?.value ?? '').replace(/\/+$/, ''),
      apiKey: apiKeyRef.current?.value ?? '',
      tenantId: tenantIdRef.current?.value ?? '',
      corsProxy: (corsProxyRef.current?.value ?? '').replace(/\/+$/, ''),
    });
  };

  return (
    <div className={`modal-overlay ${open ? 'open' : ''}`}>
      <div className="modal">
        <div className="modal-header">
          <h3>⚙ API Configuration</h3>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>n8n Base URL</label>
            <input ref={baseUrlRef} type="text" placeholder="(empty = same-origin proxy)" />
            <div className="hint">
              Leave empty when using <code style={{ fontSize: 11, color: 'var(--accent)' }}>next dev</code> proxy. Set
              to <code style={{ fontSize: 11, color: 'var(--accent)' }}>http://localhost:5678</code> for direct access.
            </div>
          </div>
          <div className="field">
            <label>X-N8N-API-KEY</label>
            <input ref={apiKeyRef} type="password" placeholder="n8n API key" />
          </div>
          <div className="field">
            <label>X-TENANT-ID</label>
            <input ref={tenantIdRef} type="text" placeholder="UUID" />
            <div className="hint">Tenant UUID for scoping</div>
          </div>
          <div className="field">
            <label>CORS Proxy URL (optional)</label>
            <input ref={corsProxyRef} type="text" placeholder="http://localhost:8080" />
            <div className="hint">
              If you get CORS errors, run a local proxy:
              <br />
              <code style={{ fontSize: 11, color: 'var(--accent)' }}>
                npx local-cors-proxy --proxyUrl http://localhost:5678 --port 8080
              </code>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save &amp; Connect
          </button>
        </div>
      </div>
    </div>
  );
}
