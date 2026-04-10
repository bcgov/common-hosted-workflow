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

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="bg-surface border border-border rounded-[14px] w-[440px] max-w-[90vw] shadow-2xl">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">⚙ API Configuration</h3>
          <button className="bg-transparent border-none text-text-muted text-xl cursor-pointer p-1" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              n8n Base URL
            </label>
            <input
              ref={baseUrlRef}
              type="text"
              placeholder="(empty = same-origin proxy)"
              className="w-full px-3 py-2.5 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
            />
            <p className="text-[11px] text-text-dim mt-1">
              Leave empty when using <code className="text-accent text-[11px]">next dev</code> proxy. Set to{' '}
              <code className="text-accent text-[11px]">http://localhost:5678</code> for direct access.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              X-N8N-API-KEY
            </label>
            <input
              ref={apiKeyRef}
              type="password"
              placeholder="n8n API key"
              className="w-full px-3 py-2.5 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              X-TENANT-ID
            </label>
            <input
              ref={tenantIdRef}
              type="text"
              placeholder="UUID"
              className="w-full px-3 py-2.5 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
            />
            <p className="text-[11px] text-text-dim mt-1">Tenant UUID for scoping</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1.5">
              CORS Proxy URL (optional)
            </label>
            <input
              ref={corsProxyRef}
              type="text"
              placeholder="http://localhost:8080"
              className="w-full px-3 py-2.5 rounded-md border border-border bg-surface-2 text-text text-sm font-mono focus:outline-none focus:border-accent"
            />
            <p className="text-[11px] text-text-dim mt-1">
              If you get CORS errors, run a local proxy:
              <br />
              <code className="text-accent text-[11px]">
                npx local-cors-proxy --proxyUrl http://localhost:5678 --port 8080
              </code>
            </p>
          </div>
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
            Save &amp; Connect
          </button>
        </div>
      </div>
    </div>
  );
}
