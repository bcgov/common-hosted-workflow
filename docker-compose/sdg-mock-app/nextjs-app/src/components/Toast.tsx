'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastType = 'success' | 'error';

const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState<ToastType>('success');
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((message: string, t: ToastType = 'success') => {
    clearTimeout(timer.current);
    setMsg(message);
    setType(t);
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={`toast ${type} ${visible ? 'show' : ''}`}>{msg}</div>
    </ToastCtx.Provider>
  );
}
