export type Tab = 'actions' | 'messages' | 'triggers';

interface TabBarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'actions', label: 'Actions' },
  { id: 'messages', label: 'Messages' },
  { id: 'triggers', label: 'Triggers' },
];

export function TabBar({ activeTab, onTabChange }: Readonly<TabBarProps>) {
  return (
    <div className="flex gap-1 rounded-lg bg-[var(--bc-surface)] p-1" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-white text-[var(--bc-text)] shadow-sm'
              : 'text-[var(--bc-muted)] hover:text-[var(--bc-text)]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
