import { IconFilter } from '@tabler/icons-react';

export type DateFilterOption = {
  label: string;
  value: string | undefined;
};

export const DATE_FILTER_OPTIONS: DateFilterOption[] = [
  { label: 'All', value: undefined },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7d', value: '7d' },
  { label: 'Last 30d', value: '30d' },
];

export function computeSinceDate(filter: string | undefined): string | undefined {
  if (!filter) return undefined;
  const now = new Date();
  switch (filter) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
}

interface DateFilterProps {
  selected: string | undefined;
  onChange: (value: string | undefined) => void;
}

export function DateFilter({ selected, onChange }: Readonly<DateFilterProps>) {
  return (
    <div className="flex items-center gap-2">
      <IconFilter size={16} className="text-[var(--bc-muted)]" aria-hidden="true" />
      <select
        aria-label="Date filter"
        value={selected ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-9 rounded-md border border-[var(--bc-border)] bg-white px-3 text-sm text-[var(--bc-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bc-blue)]"
      >
        {DATE_FILTER_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.value ?? ''}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
