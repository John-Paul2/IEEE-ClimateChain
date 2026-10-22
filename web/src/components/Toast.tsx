import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertOctagon, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string, durationMs?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string, durationMs: number = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = { id, type, title, message, durationMs };
      setToasts((prev) => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {/* Toast Overlay Container */}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      >
        {toasts.map((toast) => {
          const typeConfig = {
            success: {
              icon: CheckCircle2,
              border: "border-verified/40",
              text: "text-verified",
              bg: "bg-surface-raised",
            },
            error: {
              icon: AlertOctagon,
              border: "border-flagged/40",
              text: "text-flagged",
              bg: "bg-surface-raised",
            },
            warning: {
              icon: AlertTriangle,
              border: "border-warning/40",
              text: "text-warning",
              bg: "bg-surface-raised",
            },
            info: {
              icon: Info,
              border: "border-info/40",
              text: "text-info",
              bg: "bg-surface-raised",
            },
          }[toast.type];

          const Icon = typeConfig.icon;

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto p-4 rounded-xl border ${typeConfig.border} ${typeConfig.bg} shadow-lg text-text flex items-start gap-3 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${typeConfig.text} mt-0.5`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <h5 className="text-sm font-semibold">{toast.title}</h5>
                {toast.message && <p className="text-xs text-muted mt-0.5">{toast.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Dismiss notification"
                className="p-1 rounded hover:bg-surface text-muted hover:text-text transition-colors focus-visible:ring-1 focus-visible:ring-info focus-visible:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
