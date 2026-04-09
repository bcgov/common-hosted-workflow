'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 16,
        fontFamily: 'var(--font, sans-serif)',
        color: '#e2e6ef',
        background: '#0c0e13',
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: '#8892a8', maxWidth: 400, textAlign: 'center' }}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '8px 16px',
          borderRadius: 6,
          border: '1px solid #2a3040',
          background: '#1a1e28',
          color: '#e2e6ef',
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
