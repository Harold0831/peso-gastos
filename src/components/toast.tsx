"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Feedback inmediato para mutaciones (guardar, confirmar, borrar, sync).
 * Antes las acciones terminaban en silencio — la práctica estándar en apps
 * de finanzas es confirmar cada acción al instante. Un toast a la vez,
 * auto-descartado (2.5s, o 5s cuando trae una acción como "Deshacer" para
 * dar tiempo a reaccionar), anunciado a lectores de pantalla (aria-live).
 */

interface ToastAction {
  label: string;
  onAction: () => void;
}

interface Toast {
  message: string;
  kind: "success" | "error";
  action?: ToastAction;
}

type ShowToast = (message: string, kind?: Toast["kind"], action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<ShowToast>((message, kind = "success", action) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind, action });
    timer.current = setTimeout(() => setToast(null), action ? 5000 : 2500);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-5 pb-safe"
      >
        {toast && (
          <div
            className={`animate-screen-in pointer-events-auto flex max-w-full items-center gap-3 rounded-pill px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] ${
              toast.kind === "error" ? "bg-expense" : "bg-ink"
            }`}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  if (timer.current) clearTimeout(timer.current);
                  setToast(null);
                  toast.action?.onAction();
                }}
                className="shrink-0 rounded-pill bg-white/20 px-3 py-1 text-[12px] font-bold text-white"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
