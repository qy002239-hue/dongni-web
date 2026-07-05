import { createContext } from 'react';

export interface ToastState {
  message: string;
  visible: boolean;
}

export interface ToastContextValue {
  toast: ToastState;
  showToast: (message: string) => void;
  clearToast: () => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
