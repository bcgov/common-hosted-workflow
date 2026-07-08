import {
  IconClock,
  IconHandGrab,
  IconPlayerPlay,
  IconCircleCheck,
  IconBan,
  IconClockOff,
  IconTrash,
  IconList,
} from '@tabler/icons-react';

export const STATUS_OPTIONS = [
  'pending',
  'claimed',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'deleted',
] as const;

function formatStatusLabel(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const STATUS_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  pending: IconClock,
  claimed: IconHandGrab,
  in_progress: IconPlayerPlay,
  completed: IconCircleCheck,
  cancelled: IconBan,
  expired: IconClockOff,
  deleted: IconTrash,
};

interface StatusFilterProps {
  selected: string[];
  onChange: (statuses: string[]) => void;
  counts?: Record<string, number>;
}

export function StatusFilter({ selected, onChange, counts }: Readonly<StatusFilterProps>) {
  const isAll = selected.length === 0;
  const totalCount = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : undefined;

  function selectAll() {
    onChange([]);
  }

  function toggleStatus(status: string) {
    if (isAll) {
      // Switching from "All" to a specific status
      onChange([status]);
    } else if (selected.includes(status)) {
      // Deselecting: if it's the last one, go back to "All"
      const next = selected.filter((s) => s !== status);
      onChange(next);
    } else {
      onChange([...selected, status]);
    }
  }

  return (
    <fieldset className="flex flex-wrap gap-1.5 border-0 p-0 m-0">
      <legend className="sr-only">Status filter</legend>

      {/* All button */}
      <button
        type="button"
        onClick={selectAll}
        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
          isAll
            ? 'bg-[var(--bc-blue)] text-white border-[var(--bc-blue)]'
            : 'bg-white text-[var(--bc-muted)] border-[var(--bc-border)] hover:border-[var(--bc-blue)]'
        }`}
        aria-pressed={isAll}
      >
        <IconList size={12} aria-hidden="true" />
        All
        {totalCount !== undefined && totalCount > 0 && (
          <span className={`ml-0.5 text-[10px] font-semibold ${isAll ? 'text-white/80' : 'text-[var(--bc-text)]'}`}>
            ({totalCount})
          </span>
        )}
      </button>

      {/* Individual status buttons */}
      {STATUS_OPTIONS.map((status) => {
        const Icon = STATUS_ICONS[status];
        const statusCount = counts?.[status];
        const isActive = !isAll && selected.includes(status);
        return (
          <button
            key={status}
            type="button"
            onClick={() => toggleStatus(status)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-colors ${
              isActive
                ? 'bg-[var(--bc-blue)] text-white border-[var(--bc-blue)]'
                : 'bg-white text-[var(--bc-muted)] border-[var(--bc-border)] hover:border-[var(--bc-blue)]'
            }`}
            aria-pressed={isActive}
          >
            {Icon && <Icon size={12} aria-hidden="true" />}
            {formatStatusLabel(status)}
            {statusCount !== undefined && statusCount > 0 && (
              <span
                className={`ml-0.5 text-[10px] font-semibold ${isActive ? 'text-white/80' : 'text-[var(--bc-text)]'}`}
              >
                ({statusCount})
              </span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
