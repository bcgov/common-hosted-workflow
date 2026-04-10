'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-bg text-text">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-text-muted max-w-sm text-center">{error.message || 'An unexpected error occurred.'}</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-md border border-border bg-surface-2 text-text text-sm cursor-pointer hover:border-border-hover"
      >
        Try again
      </button>
    </div>
  );
}
