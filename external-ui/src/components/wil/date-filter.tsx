import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

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
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <Label htmlFor="date-filter">Time</Label>
      <Select id="date-filter" value={selected ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        {DATE_FILTER_OPTIONS.map((opt) => (
          <option key={opt.label} value={opt.value ?? ''}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
