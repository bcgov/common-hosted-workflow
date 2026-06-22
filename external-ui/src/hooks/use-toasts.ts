import { useCallback, useEffect, useState } from 'react';

type ToastVariant = 'default' | 'success' | 'error';

type Toast = {
  id: string;
  message: string;
  variant: ToastVariant;
};

let toastIdCounter = 0;

const listeners = new Set<(toasts: Toast[]) => void>();
let toasts: Toast[] = [];

function notifyListeners() {
  for (const listener of listeners) {
    listener([...toasts]);
  }
}

export function toast(message: string, variant: ToastVariant = 'default') {
  const id = `toast-${++toastIdCounter}`;
  toasts = [...toasts, { id, message, variant }];
  notifyListeners();

  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 5000);

  return id;
}

toast.success = (message: string) => toast(message, 'success');
toast.error = (message: string) => toast(message, 'error');

export function useToasts() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.add(setCurrentToasts);
    return () => {
      listeners.delete(setCurrentToasts);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, []);

  return { toasts: currentToasts, dismiss };
}
