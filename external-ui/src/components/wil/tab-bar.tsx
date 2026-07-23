import { TabList, TabTrigger } from '@/components/ui/tabs';

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
    <TabList aria-label="Workflow interaction views">
      {TABS.map((tab) => (
        <TabTrigger key={tab.id} selected={activeTab === tab.id} onClick={() => onTabChange(tab.id)}>
          {tab.label}
        </TabTrigger>
      ))}
    </TabList>
  );
}
