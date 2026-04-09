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
      <button className="payload-toggle" onClick={() => setOpen((o) => !o)}>
        {label} {open ? '▴' : '▾'}
      </button>
      <div className={`payload-block ${open ? 'open' : ''}`}>{JSON.stringify(data, null, 2)}</div>
    </>
  );
}
