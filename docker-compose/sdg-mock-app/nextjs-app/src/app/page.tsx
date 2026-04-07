'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AppConfig,
  type FormConfig,
  type Message,
  type ActionRequest,
  loadConfig,
  saveConfig,
  loadFormConfig,
  saveFormConfig,
  apiFetch,
} from '@/lib/api';
import { ToastProvider, useToast } from '@/components/Toast';
import SettingsModal from '@/components/SettingsModal';
import FormSettingsModal from '@/components/FormSettingsModal';
import FormsPanel from '@/components/FormsPanel';
import MessagesPanel from '@/components/MessagesPanel';
import ActionsPanel from '@/components/ActionsPanel';

export default function Page() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}

function Dashboard() {
  const toast = useToast();

  // ── Config state ──
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [formCfg, setFormCfg] = useState<FormConfig | null>(null);

  // ── UI state ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [formSettingsOpen, setFormSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState('');

  // ── Filter state ──
  const [actorId, setActorId] = useState('amina');
  const [since, setSince] = useState('');
  const [limit, setLimit] = useState(50);

  // ── Data state ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionRequest[]>([]);
  const [actError, setActError] = useState<string | null>(null);

  // Ref to always have latest config in callbacks
  const configRef = useRef(config);
  configRef.current = config;

  // ── Load persisted config on mount ──
  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
    setFormCfg(loadFormConfig());
  }, []);

  // ── Refresh logic ──
  const refresh = useCallback(async () => {
    const cfg = configRef.current;
    if (!cfg) return;
    if (!cfg.apiKey) {
      toast('Configure API key in settings first', 'error');
      setSettingsOpen(true);
      return;
    }
    if (!actorId.trim()) {
      toast('Actor ID is required', 'error');
      return;
    }

    setLoading(true);
    const basePath = `/rest/custom/v1/actors/${encodeURIComponent(actorId.trim())}`;
    const filters = { since, limit };

    try {
      const [msgResult, actResult] = await Promise.allSettled([
        apiFetch<Message[] | { items: Message[] }>(cfg, `${basePath}/messages`, filters),
        apiFetch<ActionRequest[] | { items: ActionRequest[] }>(cfg, `${basePath}/actions`, filters),
      ]);

      if (msgResult.status === 'fulfilled') {
        const data = msgResult.value;
        setMessages(Array.isArray(data) ? data : data.items || []);
        setMsgError(null);
      } else {
        setMsgError(msgResult.reason?.message ?? 'Unknown error');
      }

      if (actResult.status === 'fulfilled') {
        const data = actResult.value;
        setActions(Array.isArray(data) ? data : data.items || []);
        setActError(null);
      } else {
        setActError(actResult.reason?.message ?? 'Unknown error');
      }

      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [actorId, since, limit, toast]);

  // Auto-refresh on first config load
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (config?.apiKey && !didAutoRefresh.current) {
      didAutoRefresh.current = true;
      refresh();
    }
  }, [config, refresh]);

  // Keyboard shortcut: Ctrl/Cmd+R
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        refresh();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [refresh]);

  // ── Settings handlers ──
  const handleSaveSettings = (cfg: AppConfig) => {
    setConfig(cfg);
    configRef.current = cfg;
    saveConfig(cfg);
    setSettingsOpen(false);
    toast('Configuration saved', 'success');
    setTimeout(refresh, 100);
  };

  const handleSaveFormSettings = (cfg: FormConfig) => {
    setFormCfg(cfg);
    saveFormConfig(cfg);
    setFormSettingsOpen(false);
    toast('Form settings saved', 'success');
  };

  // ── Connection status ──
  const connMode = config?.corsProxy ? 'proxy' : config?.baseUrl ? 'direct' : 'same-origin';
  const isConnected = !!config?.apiKey;
  const hasError = !!msgError || !!actError;

  if (!config || !formCfg) return null; // loading persisted state

  return (
    <>
      {/* ── Header ── */}
      <div className="header">
        <div className="header-left">
          <div className="logo">C</div>
          <div>
            <div className="header-title">SDG Demo</div>
            <div className="header-sub">An application using Workflow as a service</div>
          </div>
        </div>
        <div className="header-right">
          <div className={`status-pill ${hasError ? 'error' : isConnected ? 'connected' : ''}`}>
            <span className="status-dot" />
            <span>{hasError ? 'Error' : isConnected ? `Connected (${connMode})` : 'Not configured'}</span>
          </div>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Settings
          </button>
          <button className={`btn btn-primary ${loading ? 'loading' : ''}`} onClick={refresh}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={loading ? { animation: 'spin 0.8s linear infinite' } : undefined}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="controls">
        <div className="control-group">
          <span className="control-label">Actor ID</span>
          <input
            type="text"
            className="control-input"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            style={{ width: 140 }}
            placeholder="e.g. amina"
          />
        </div>
        <div className="control-group">
          <span className="control-label">Since</span>
          <input
            type="datetime-local"
            className="control-input"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            style={{ width: 220 }}
          />
        </div>
        <div className="control-group">
          <span className="control-label">Limit</span>
          <input
            type="number"
            className="control-input"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            min={1}
            max={200}
            style={{ width: 70 }}
          />
        </div>
        <div className="spacer" />
        {lastRefresh && (
          <span className="control-label" style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
            Last refresh: {lastRefresh}
          </span>
        )}
      </div>

      {/* ── Main Grid ── */}
      <div className="main">
        <FormsPanel
          appConfig={config}
          formConfig={formCfg}
          actorId={actorId.trim()}
          onOpenFormSettings={() => setFormSettingsOpen(true)}
          onRefresh={refresh}
        />
        <MessagesPanel messages={messages} error={msgError} />
        <ActionsPanel actions={actions} error={actError} config={config} actorId={actorId.trim()} onRefresh={refresh} />
      </div>

      {/* ── Modals ── */}
      <SettingsModal
        open={settingsOpen}
        config={config}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />
      <FormSettingsModal
        open={formSettingsOpen}
        config={formCfg}
        onSave={handleSaveFormSettings}
        onClose={() => setFormSettingsOpen(false)}
      />
    </>
  );
}
