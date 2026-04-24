'use client';

import Link from 'next/link';

interface PlaygroundHeaderProps {
  playgroundName: string;
  activeTab?: 'configuration' | 'user-test';
}

export default function PlaygroundHeader({ playgroundName, activeTab }: Readonly<PlaygroundHeaderProps>) {
  const encodedName = encodeURIComponent(playgroundName);

  return (
    <div className="flex items-center justify-between px-7 py-4 border-b border-border bg-surface sticky top-0 z-50">
      <div className="flex items-center gap-3.5">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center font-bold text-[15px] text-white">
          C
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight">
            <span className="text-text">{playgroundName}</span>
          </div>
          <div className="text-xs text-text-muted mt-px">Playground Configuration</div>
        </div>
      </div>

      <nav className="flex items-center gap-2">
        <Link
          href={`/playground/${encodedName}/user-test`}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
            activeTab === 'user-test'
              ? 'bg-accent text-white'
              : 'border border-border bg-surface-2 text-text hover:border-accent/40'
          }`}
        >
          User Test
        </Link>
        <Link
          href={`/playground/${encodedName}/configuration`}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
            activeTab === 'configuration'
              ? 'bg-accent text-white'
              : 'border border-border bg-surface-2 text-text hover:border-accent/40'
          }`}
        >
          Configuration
        </Link>
        <Link
          href="/"
          className="px-3 py-1.5 rounded-md border border-border bg-surface-2 text-text-muted text-xs font-medium hover:border-accent/40 transition-all duration-150"
        >
          ← All Playgrounds
        </Link>
      </nav>
    </div>
  );
}
