'use client';

import { ToastProvider } from '@/components/Toast';
import SettingsModal from '@/components/SettingsModal';
import FormSettingsModal from '@/components/FormSettingsModal';
import FormsPanel from '@/components/FormsPanel';
import MessagesPanel from '@/components/MessagesPanel';
import ActionsPanel from '@/components/ActionsPanel';
import GearIcon from '@/components/icons/GearIcon';
import { useDashboard } from '@/hooks/useDashboard';

export default function Page() {
  return (
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  );
}

function Dashboard() {
  const {
    config,
    formCfg,
    settingsOpen,
    setSettingsOpen,
    formSettingsOpen,
    setFormSettingsOpen,
    loading,
    lastRefresh,
    actorId,
    setActorId,
    since,
    setSince,
    limit,
    setLimit,
    messages,
    msgError,
    actions,
    actError,
    connMode,
    isConnected,
    hasError,
    refresh,
    handleSaveSettings,
    handleSaveFormSettings,
  } = useDashboard();

  if (!config || !formCfg) return null;

  return (
    <>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-7 py-4 border-b border-border bg-surface sticky top-0 z-50">
        <div className="flex items-center gap-3.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center font-bold text-[15px] text-white">
            C
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">SDG Demo</div>
            <div className="text-xs text-text-muted mt-px">An application using Workflow as a service</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              hasError
                ? 'bg-red-soft text-red-400'
                : isConnected
                  ? 'bg-green-soft text-emerald-400'
                  : 'bg-surface-3 text-text-muted'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            <span>{hasError ? 'Error' : isConnected ? `Connected (${connMode})` : 'Not configured'}</span>
          </div>
          <button
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-border bg-surface-2 text-text text-[13px] font-medium cursor-pointer whitespace-nowrap hover:border-border-hover hover:bg-surface-3 transition-all duration-150"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
            Settings
          </button>
          <button
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-accent bg-accent text-white text-[13px] font-medium cursor-pointer whitespace-nowrap hover:bg-[#3d7ae8] transition-all duration-150 ${loading ? 'opacity-60 pointer-events-none' : ''}`}
            onClick={refresh}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`size-[15px] ${loading ? 'animate-spin' : ''}`}
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
      <div className="flex items-center gap-3 flex-wrap px-7 py-3.5 border-b border-border bg-surface">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted font-medium">Actor ID</span>
          <input
            type="text"
            className="w-[140px] px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[13px] font-mono focus:outline-none focus:border-accent"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            placeholder="e.g. amina"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted font-medium">Since</span>
          <input
            type="datetime-local"
            className="w-[220px] px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[13px] font-mono focus:outline-none focus:border-accent"
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-text-muted font-medium">Limit</span>
          <input
            type="number"
            className="w-[70px] px-2.5 py-1.5 rounded-md border border-border bg-surface-2 text-text text-[13px] font-mono focus:outline-none focus:border-accent"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            min={1}
            max={200}
          />
        </div>
        <div className="flex-1" />
        {lastRefresh && (
          <span className="text-[11px] text-text-muted font-mono font-medium">Last refresh: {lastRefresh}</span>
        )}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-[300px_1fr_1fr] max-lg:grid-cols-2 max-sm:grid-cols-1 min-h-[calc(100vh-110px)]">
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
