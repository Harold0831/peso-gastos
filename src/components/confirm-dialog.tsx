"use client";

import { useEffect } from "react";

/**
 * Diálogo modal de confirmación para acciones destructivas. Un modal que
 * interrumpe (overlay + foco visual) comunica mejor la gravedad que un
 * confirm inline pegado al botón — y evita toques por accidente. Cierra
 * con Escape o tocando el fondo; el botón destructivo siempre en rojo.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Deshabilita los botones mientras corre la acción. */
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        aria-label="Cancelar"
        onClick={() => !pending && onCancel()}
        className="absolute inset-0 bg-black/40"
      />
      <div className="animate-screen-in relative z-10 mx-4 mb-6 w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:mb-0">
        <h2 className="text-[16px] font-bold tracking-tight text-ink">{title}</h2>
        {description && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-btn border border-line py-3 text-[13px] font-semibold text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 rounded-btn bg-expense py-3 text-[13px] font-bold text-white disabled:opacity-60"
          >
            {pending ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
