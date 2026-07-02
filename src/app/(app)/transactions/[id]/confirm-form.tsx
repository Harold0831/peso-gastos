"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "@/lib/types";
import { formatFullDate, formatTime } from "@/lib/format";
import { confirmTransaction } from "@/lib/actions";
import { BackIcon } from "@/components/icons";

export function ConfirmForm({ tx, categories }: { tx: Transaction; categories: string[] }) {
  const router = useRouter();
  const suggested = tx.category ?? tx.ai_suggested_category;
  const [category, setCategory] = useState<string | null>(suggested);
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [editingAmount, setEditingAmount] = useState(false);
  const [amount, setAmount] = useState(tx.amount.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const date = new Date(tx.date);
  const isExpense = tx.type === "expense";

  // Pone la sugerencia de la IA de primera en las pills
  const orderedCategories = suggested
    ? [suggested, ...categories.filter((c) => c !== suggested)]
    : categories;

  const handleConfirm = () => {
    if (!category) {
      setError("Selecciona una categoría");
      return;
    }
    setError(null);
    startSaving(async () => {
      const parsedAmount = Number(amount);
      const result = await confirmTransaction({
        id: tx.id,
        category,
        notes: notes || undefined,
        amount: editingAmount && parsedAmount !== tx.amount ? parsedAmount : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      router.push("/transactions");
      router.refresh();
    });
  };

  return (
    <main className="pt-safe">
      {/* Header */}
      <div className="flex items-center px-4 py-2">
        <button onClick={() => router.back()} aria-label="Volver" className="p-2 text-ink">
          <BackIcon />
        </button>
        <h1 className="flex-1 text-center text-[15px] font-semibold tracking-tight text-ink">
          {tx.confirmed ? "Detalle de transacción" : "Confirmar transacción"}
        </h1>
        <span className="w-[38px]" />
      </div>

      {/* Monto grande */}
      <div className="px-5 pb-7 pt-5 text-center">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          {isExpense ? "Gasto" : "Ingreso"}
        </div>
        {editingAmount ? (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-base font-bold text-ink-muted">RD$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="w-44 border-b-2 border-accent bg-transparent text-center text-4xl font-extrabold tracking-tighter text-ink outline-none"
            />
          </div>
        ) : (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-base font-bold text-ink-muted">RD$</span>
            <span
              className={`text-[44px] font-extrabold leading-none tracking-tighter ${
                isExpense ? "text-expense" : "text-income"
              }`}
            >
              {Number(amount).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        )}
        <div className="mt-2.5 text-sm font-medium text-ink-muted">{tx.merchant}</div>
      </div>

      {/* Datos */}
      <section className="mx-5 overflow-hidden rounded-card border border-line bg-card">
        {(
          [
            ["Comercio", tx.merchant],
            ["Fecha", formatFullDate(date)],
            ["Hora", formatTime(date)],
            ["Tarjeta", tx.card_last4 ? `•••• ${tx.card_last4}` : "—"],
          ] as const
        ).map(([label, value], i, all) => (
          <div
            key={label}
            className={`flex items-center justify-between px-4 py-3.5 ${
              i < all.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <span className="text-[13px] font-medium text-ink-muted">{label}</span>
            <span className="text-[13px] font-semibold tracking-tight text-ink">{value}</span>
          </div>
        ))}
      </section>

      {/* Categoría */}
      <div className="flex items-center gap-1.5 px-5 pb-2.5 pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink">Categoría</h2>
        {tx.ai_suggested_category && (
          <span className="rounded-[4px] bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent">
            IA
          </span>
        )}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1">
        {orderedCategories.map((name) => {
          const active = category === name;
          const isAiSuggestion = name === tx.ai_suggested_category;
          return (
            <button
              key={name}
              onClick={() => setCategory(name)}
              className={`flex shrink-0 items-center gap-1.5 rounded-pill border px-3.5 py-2 text-xs font-semibold transition ${
                active ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink"
              }`}
            >
              {name}
              {isAiSuggestion && (
                <span
                  className={`rounded-[3px] px-1 text-[9px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-accent/10 text-accent"
                  }`}
                >
                  IA
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Nota */}
      <div className="px-5 pt-5">
        <h2 className="pb-2 text-xs font-semibold uppercase tracking-wide text-ink">Nota</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Añadir nota…"
          rows={3}
          className="w-full resize-none rounded-btn border border-line bg-surface p-3 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-accent"
        />
      </div>

      {error && <p className="px-5 pt-2 text-sm font-medium text-expense">{error}</p>}

      {/* CTA */}
      <div className="px-5 pt-4">
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full rounded-[14px] bg-accent py-4 text-[15px] font-bold tracking-tight text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? "Guardando…" : tx.confirmed ? "Guardar cambios" : "Confirmar"}
        </button>
        <button
          onClick={() => setEditingAmount((v) => !v)}
          className="mt-1.5 w-full py-3 text-[13px] font-semibold text-accent"
        >
          {editingAmount ? "Cancelar edición" : "Editar monto"}
        </button>
      </div>
    </main>
  );
}
