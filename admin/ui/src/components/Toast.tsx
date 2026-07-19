import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Toast as AgniToast } from "./agni/feedback/Toast";

/**
 * Keeps this app's existing ToastProvider/useToast API (context, auto-
 * dismiss stack) — AgniUI's own Toast component is stateless/presentational
 * by design ("drive visibility from your own store"), so the stack/timer
 * logic here is unchanged, only each toast's own rendering now comes from
 * the copied AgniUI component instead of the old hand-rolled markup.
 */
type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  title?: string;
  message: string;
}

interface ToastApi {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, title?: string) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, kind, message, title }]);
      setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  const api: ToastApi = {
    success: (m, t) => push("success", m, t),
    error: (m, t) => push("error", m, t),
    info: (m, t) => push("info", m, t),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <AgniToast key={t.id} tone={t.kind} title={t.title} message={t.message} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
