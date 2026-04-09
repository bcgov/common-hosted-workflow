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
import { useToast } from '@/components/Toast';

export function useDashboard() {
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

  return {
    // Config
    config,
    formCfg,
    // UI state
    settingsOpen,
    setSettingsOpen,
    formSettingsOpen,
    setFormSettingsOpen,
    loading,
    lastRefresh,
    // Filters
    actorId,
    setActorId,
    since,
    setSince,
    limit,
    setLimit,
    // Data
    messages,
    msgError,
    actions,
    actError,
    // Derived
    connMode,
    isConnected,
    hasError,
    // Actions
    refresh,
    handleSaveSettings,
    handleSaveFormSettings,
  };
}
