'use client';

import type { PlaygroundSummary } from '@/types/playground';
import PlaygroundCard from '@/components/PlaygroundCard';

interface PlaygroundListProps {
  playgrounds: PlaygroundSummary[];
  onDelete: (name: string) => void;
  onClone: (name: string) => void;
}

export default function PlaygroundList({ playgrounds, onDelete, onClone }: Readonly<PlaygroundListProps>) {
  if (playgrounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-surface-2 flex items-center justify-center mb-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-7 text-text-muted"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <p className="text-sm font-medium text-text-muted mb-1">No playgrounds yet</p>
        <p className="text-xs text-text-muted">Create your first playground to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {playgrounds.map((pg) => (
        <PlaygroundCard key={pg.name} playground={pg} onDelete={onDelete} onClone={onClone} />
      ))}
    </div>
  );
}
