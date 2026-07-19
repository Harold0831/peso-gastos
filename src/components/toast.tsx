"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Feedback inmediato para mutaciones (guardar, confirmar, borrar, sync).
 * Antes las acciones terminaban en silencio — la práctica estándar en apps
 * de finanzas es confirmar cada acción al instante. Un toast a la vez,
 * auto-descartado a los 2.5s, anunciado a lectores de pantalla (aria-live).
 */

interface Toast {
  message: string;
  kind: "success" | "error";
}

const ToastContext = createContext<(message: string, kind?: Toast["kind"]) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, kind: Toast["kind"] = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), 2500);
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
            className={`animate-screen-in max-w-full rounded-pill px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] ${
              toast.kind === "error" ? "bg-expense" : "bg-ink"
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
