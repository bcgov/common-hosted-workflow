'use client';

import { useState } from 'react';

interface Props {
  label: string;
  data: unknown;
}

export default function PayloadBlock({ label, data }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="text-[11px] text-accent font-semibold bg-transparent border-none p-0 mt-1.5 cursor-pointer hover:underline"
        onClick={() => setOpen((o) => !o)}
      >
        {label} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="mt-2 p-2.5 bg-bg rounded-md border border-border font-mono text-[11px] text-text-muted max-h-[200px] overflow-y-auto whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </div>
      )}
    </>
  );
}
