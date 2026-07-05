import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ToastContext } from './toast-context';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState({ message: '', visible: false });

  const value = useMemo(() => ({
    toast,
    showToast(message: string) {
      setToast({ message, visible: true });
    },
    clearToast() {
      setToast({ message: '', visible: false });
    }
  }), [toast]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}
