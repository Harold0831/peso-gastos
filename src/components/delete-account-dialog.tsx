"use client";

import { useEffect, useState } from "react";
import { deleteAccountAction } from "@/lib/actions";
import { DELETE_ACCOUNT_KEYWORD } from "@/lib/schemas";

/**
 * Confirmación para eliminar la cuenta. No reusa ConfirmDialog a propósito:
 * esto es lo único irreversible de toda la app (el borrado de transacciones
 * es soft delete, las metas se pueden volver a crear), así que en vez de un
 * botón de "¿seguro?" exige teclear una palabra. Ese pequeño trabajo manual
 * es lo que separa un arrepentimiento de un desastre.
 *
 * En éxito la server action redirige a /login, así que este componente no
 * tiene que limpiar nada: la página entera se va.
 */
export function DeleteAccountDialog({ open, onCancel }: { open: boolean; onCancel: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmation("");
    setError(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `pending` fuera de las deps a propósito: solo hace falta re-suscribir
    // al abrir/cerrar, y reiniciar el input a media escritura sería un bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onCancel]);

  if (!open) return null;

  const matches = confirmation.trim().toUpperCase() === DELETE_ACCOUNT_KEYWORD;

  const handleDelete = async () => {
    setPending(true);
    setError(null);
    // Si todo va bien, la action redirige y esto nunca resuelve.
    const result = await deleteAccountAction(confirmation);
    setError(result.error ?? "No se pudo eliminar la cuenta.");
    setPending(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        aria-label="Cancelar"
        onClick={() => !pending && onCancel()}
        className="absolute inset-0 bg-black/40"
      />
      <div className="animate-screen-in relative z-10 mx-4 mb-6 w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:mb-0">
        <h2 id="delete-account-title" className="text-[16px] font-bold tracking-tight text-ink">
          Eliminar tu cuenta
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          Se borrarán para siempre tus transacciones, presupuestos, metas, gastos fijos, tarjetas y
          categorías, y se retirará el permiso de lectura de tu Gmail.{" "}
          <span className="font-semibold text-ink">Esto no se puede deshacer.</span>
        </p>

        <label
          htmlFor="delete-account-confirm"
          className="mt-4 block text-[13px] leading-relaxed text-ink-muted"
        >
          Escribe <span className="font-bold text-ink">{DELETE_ACCOUNT_KEYWORD}</span> para
          confirmar:
        </label>
        <input
          id="delete-account-confirm"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={pending}
          className="mt-2 w-full rounded-btn border border-line bg-surface p-3 text-sm tracking-wide text-ink outline-none focus:border-expense"
        />

        {error && <p className="mt-2 text-[13px] font-medium text-expense">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-btn border border-line py-3 text-[14px] font-semibold text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={pending || !matches}
            className="flex-1 rounded-btn bg-expense py-3 text-[14px] font-bold text-white disabled:opacity-50"
          >
            {pending ? "Eliminando…" : "Eliminar cuenta"}
          </button>
        </div>
      </div>
    </div>
  );
}
