'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type FormConfig,
  type Message,
  type ActionRequest,
  loadFormConfig,
  saveFormConfig,
  apiFetch,
  setPlaygroundContext,
} from '@/lib/api';
import { useToast } from '@/components/Toast';

export function useDashboard(playgroundName?: string) {
  const toast = useToast();

  // ── Playground context ──
  useEffect(() => {
    if (playgroundName) {
      setPlaygroundContext(playgroundName);
    }
    return () => {
      setPlaygroundContext(null);
    };
  }, [playgroundName]);

  // ── Config state ──
  const [formCfg, setFormCfg] = useState<FormConfig | null>(null);

  // ── UI state ──
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

  // ── Load persisted config on mount ──
  useEffect(() => {
    setFormCfg(loadFormConfig());
  }, []);

  // ── Refresh logic ──
  const refresh = useCallback(async () => {
    if (!actorId.trim()) {
      toast('Actor ID is required', 'error');
      return;
    }

    setLoading(true);
    const basePath = `/actors/${encodeURIComponent(actorId.trim())}`;
    const filters = { since, limit };

    try {
      const [msgResult, actResult] = await Promise.allSettled([
        apiFetch<Message[] | { items: Message[] }>(`${basePath}/messages`, filters),
        apiFetch<ActionRequest[] | { items: ActionRequest[] }>(`${basePath}/actions`, filters),
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

  // Auto-refresh on mount
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (!didAutoRefresh.current) {
      didAutoRefresh.current = true;
      refresh();
    }
  }, [refresh]);

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
  const handleSaveFormSettings = (cfg: FormConfig) => {
    setFormCfg(cfg);
    saveFormConfig(cfg);
    setFormSettingsOpen(false);
    toast('Form settings saved', 'success');
  };

  return {
    // Config
    formCfg,
    // UI state
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
    // Actions
    refresh,
    handleSaveFormSettings,
  };
}
