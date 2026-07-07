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

interface StatusFilterProps {
  selected: string[];
  onChange: (statuses: string[]) => void;
}

export function StatusFilter({ selected, onChange }: Readonly<StatusFilterProps>) {
  function toggleStatus(status: string) {
    if (selected.includes(status)) {
      if (selected.length > 1) {
        onChange(selected.filter((s) => s !== status));
      }
    } else {
      onChange([...selected, status]);
    }
  }

  return (
    <fieldset className="flex flex-wrap gap-1.5 border-0 p-0 m-0">
      <legend className="sr-only">Status filter</legend>
      {STATUS_OPTIONS.map((status) => (
        <button
          key={status}
          type="button"
          onClick={() => toggleStatus(status)}
          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
            selected.includes(status)
              ? 'bg-[var(--bc-blue)] text-white border-[var(--bc-blue)]'
              : 'bg-white text-[var(--bc-muted)] border-[var(--bc-border)] hover:border-[var(--bc-blue)]'
          }`}
          aria-pressed={selected.includes(status)}
        >
          {formatStatusLabel(status)}
        </button>
      ))}
    </fieldset>
  );
}
