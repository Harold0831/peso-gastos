"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Currency, RecurringStatusItem } from "@/lib/types";
import { currencySymbol, formatMoney } from "@/lib/format";
import { createRecurringExpense, deleteRecurringExpense, setRecurringPaid } from "@/lib/actions";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function RecurringList({
  items,
  categories,
  currency,
  monthKey,
}: {
  items: RecurringStatusItem[];
  categories: string[];
  currency: Currency;
  monthKey: string;
}) {
  const paid = items.filter((i) => i.status === "paid").length;

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Gastos fijos</h1>
        {items.length > 0 && (
          <p className="mt-1 text-[13px] text-ink-muted">
            {paid === items.length
              ? "🎉 Todos pagados este mes"
              : `${paid} de ${items.length} pagados este mes`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-5">
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-muted">
            Aún no tienes gastos fijos. Agrega alquiler, Netflix, la luz… y Peso te dirá cada mes
            cuáles ya pagaste.
          </p>
        )}
        {items.map((item) => (
          <RecurringCard key={item.expense.id} item={item} monthKey={monthKey} />
        ))}
        <NewRecurringForm categories={categories} currency={currency} />
      </div>
    </main>
  );
}

function RecurringCard({ item, monthKey }: { item: RecurringStatusItem; monthKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startBusy] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const paid = item.status === "paid";

  const toggle = () => {
    startBusy(async () => {
      const result = await setRecurringPaid({
        recurring_id: item.expense.id,
        month: monthKey,
        status: paid ? "pending" : "paid",
      });
      if (!result.ok) {
        toast(result.error ?? "No se pudo actualizar", "error");
        return;
      }
      toast(paid ? "Marcado como pendiente" : "✓ Marcado como pagado");
      router.refresh();
    });
  };

  const handleDelete = () => {
    startBusy(async () => {
      const result = await deleteRecurringExpense(item.expense.id);
      if (!result.ok) {
        toast(result.error ?? "No se pudo eliminar", "error");
        setConfirmingDelete(false);
        return;
      }
      toast("Gasto fijo eliminado");
      setConfirmingDelete(false);
      router.refresh();
    });
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-card border bg-card p-4 ${
        paid ? "border-income/40" : "border-line"
      }`}
    >
      {/* Toggle pagado/pendiente */}
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={paid}
        aria-label={paid ? "Marcar como pendiente" : "Marcar como pagado"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill border-2 text-sm font-bold transition disabled:opacity-50 ${
          paid ? "border-income bg-income text-white" : "border-line bg-surface text-transparent"
        }`}
      >
        ✓
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-bold tracking-tight text-ink">
            {item.expense.name}
          </span>
          {item.expense.due_day && (
            <span className="shrink-0 text-[10px] font-medium text-ink-muted">
              día {item.expense.due_day}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] font-medium text-ink-muted">
          {item.expense.amount != null && (
            <span className="font-semibold text-ink">
              {formatMoney(item.expense.amount, item.expense.currency)}
            </span>
          )}
          {item.expense.amount != null && item.expense.category ? " · " : ""}
          {item.expense.category}
          {paid ? (
            item.auto ? (
              <span className="text-income">
                {" · "}✓ detectado{item.matchedMerchant ? `: ${item.matchedMerchant}` : ""}
              </span>
            ) : (
              <span className="text-income">{" · "}✓ pagado</span>
            )
          ) : (
            <span>{" · "}pendiente</span>
          )}
        </div>
      </div>

      <button
        onClick={() => setConfirmingDelete(true)}
        disabled={busy}
        aria-label={`Eliminar ${item.expense.name}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-ink-muted transition active:bg-background disabled:opacity-50"
      >
        🗑️
      </button>

      <ConfirmDialog
        open={confirmingDelete}
        title={`¿Eliminar "${item.expense.name}"?`}
        description="Se quita de tus gastos fijos. Tus transacciones no se tocan."
        confirmLabel="Eliminar"
        pending={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function NewRecurringForm({ categories, currency }: { categories: string[]; currency: Currency }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const reset = () => {
    setName("");
    setAmount("");
    setDueDay("");
    setCategory("");
    setError(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 mt-1 rounded-[14px] border-[1.5px] border-dashed border-line py-3.5 text-[13px] font-semibold text-ink-muted"
      >
        + Nuevo gasto fijo
      </button>
    );
  }

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await createRecurringExpense({
        name,
        currency,
        amount: amount || undefined,
        due_day: dueDay || undefined,
        category: category || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo crear");
        return;
      }
      toast("✓ Gasto fijo creado");
      reset();
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

  return (
    <div className="mb-4 mt-1 rounded-card border border-line bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">
        Nuevo gasto fijo
      </h3>
      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (ej. Netflix, Alquiler)"
          maxLength={40}
          autoFocus
          className={inputClass}
        />
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Monto (${currencySymbol(currency)}) · opcional`}
            className={inputClass}
          />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dueDay}
            onChange={(e) => setDueDay(e.target.value)}
            placeholder="Día"
            className="w-24 shrink-0 rounded-btn border border-line bg-surface p-3 text-center text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCategory((c) => (c === name ? "" : name))}
                className={`rounded-pill border px-3 py-1.5 text-[11px] font-semibold transition ${
                  category === name
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-surface text-ink"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-expense">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={reset}
          className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-semibold text-ink"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex-1 rounded-btn bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Crear"}
        </button>
      </div>
    </div>
  );
}
