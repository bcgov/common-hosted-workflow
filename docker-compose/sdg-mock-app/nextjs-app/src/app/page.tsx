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
            <GearIcon />
            Settings
          </button>
          <button className={`btn btn-primary ${loading ? 'loading' : ''}`} onClick={refresh}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={
                loading ? { width: 15, height: 15, animation: 'spin 0.8s linear infinite' } : { width: 15, height: 15 }
              }
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
