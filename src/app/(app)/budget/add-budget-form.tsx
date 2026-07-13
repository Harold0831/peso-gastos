"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBudget } from "@/lib/actions";
import { currencySymbol } from "@/lib/format";
import type { Currency } from "@/lib/types";

export function AddBudgetForm({
  month,
  categories,
  currency,
}: {
  month: string;
  categories: { id: string; name: string; icon: string }[];
  currency: Currency;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1.5 rounded-[14px] border-[1.5px] border-dashed border-line py-3.5 text-[13px] font-semibold text-ink-muted"
      >
        + Agregar presupuesto
      </button>
    );
  }

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await createBudget({ category_id: categoryId, month, limit_amount: amount });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      setOpen(false);
      setCategoryId("");
      setAmount("");
      router.refresh();
    });
  };

  return (
    <div className="mt-1.5 rounded-[14px] border border-line bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">
        Nuevo presupuesto
      </h3>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
        {categories.length === 0 ? (
          <p className="text-xs text-ink-muted">Todas las categorías ya tienen presupuesto.</p>
        ) : (
          categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className={`shrink-0 rounded-pill border px-3 py-1.5 text-xs font-semibold transition ${
                categoryId === c.id
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-ink"
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))
        )}
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder={`Límite mensual (${currencySymbol(currency)})`}
        className="mb-3 w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
      />
      {error && <p className="mb-2 text-xs font-medium text-expense">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-semibold text-ink"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !categoryId || !amount}
          className="flex-1 rounded-btn bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}
