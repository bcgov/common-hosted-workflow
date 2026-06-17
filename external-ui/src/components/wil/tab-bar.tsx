export type Tab = 'actions' | 'messages';

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function TabBar({ activeTab, onTabChange }: Readonly<TabBarProps>) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--bc-surface)] p-1" role="tablist">
      <button
        role="tab"
        aria-selected={activeTab === 'actions'}
        onClick={() => onTabChange('actions')}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          activeTab === 'actions'
            ? 'bg-white text-[var(--bc-text)] shadow-sm'
            : 'text-[var(--bc-muted)] hover:text-[var(--bc-text)]'
        }`}
      >
        Actions
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'messages'}
        onClick={() => onTabChange('messages')}
        className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
          activeTab === 'messages'
            ? 'bg-white text-[var(--bc-text)] shadow-sm'
            : 'text-[var(--bc-muted)] hover:text-[var(--bc-text)]'
        }`}
      >
        Messages
      </button>
    </div>
  );
}
