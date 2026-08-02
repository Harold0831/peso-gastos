"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOpeningBalance } from "@/lib/actions";
import { currencySymbol } from "@/lib/format";
import type { Currency } from "@/lib/types";
import { useToast } from "@/components/toast";

/**
 * "Ajustar saldo": deja al usuario fijar su saldo real disponible. El input
 * viene pre-llenado con el saldo que Peso calculó de su historial, así que
 * solo lo corrige al número real de su banco si quiere. De ahí en adelante
 * el balance suma/resta cada transacción nueva.
 */
export function AdjustBalanceDialog({
  currentBalance,
  currency,
  demoMode,
}: {
  currentBalance: number;
  currency: Currency;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Pre-llena con el saldo actual (redondeado a 2 decimales) al abrir.
  useEffect(() => {
    if (open) {
      setValue(currentBalance.toFixed(2));
      setError(null);
    }
  }, [open, currentBalance]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const save = () => {
    setError(null);
    startSaving(async () => {
      const result = await setOpeningBalance({ amount: value });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      toast("✓ Saldo ajustado");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-[12px] font-semibold text-accent"
      >
        Ajustar saldo
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ajustar saldo"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        >
          <button
            aria-label="Cancelar"
            onClick={() => !saving && setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="animate-screen-in relative z-10 mx-4 mb-6 w-full max-w-sm rounded-card border border-line bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:mb-0">
            <h2 className="text-[16px] font-bold tracking-tight text-ink">Ajustar saldo</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
              Pon tu saldo disponible real. Peso partirá de ahí y le sumará o restará cada
              transacción nueva.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-btn border border-line bg-surface px-3">
              <span className="text-sm font-semibold text-ink-muted">
                {currencySymbol(currency)}
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type="text"
                inputMode="decimal"
                autoFocus
                className="w-full bg-transparent py-3 text-sm text-ink outline-none"
              />
            </div>
            {error && <p className="mt-2 text-xs font-medium text-expense">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="flex-1 rounded-btn border border-line py-3 text-[13px] font-semibold text-ink disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || demoMode}
                className="flex-1 rounded-btn bg-accent py-3 text-[13px] font-bold text-white disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
