'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastType = 'success' | 'error';

const ToastCtx = createContext<(msg: string, type?: ToastType) => void>(() => {});

export const useToast = () => useContext(ToastCtx);

const typeClasses: Record<ToastType, string> = {
  success: 'bg-emerald-900 text-emerald-200 border-emerald-500',
  error: 'bg-red-950 text-red-200 border-red-400',
};

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
      <div
        className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium z-[1000] max-w-sm border transition-all duration-300 ease-out ${typeClasses[type]} ${visible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}
      >
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}
