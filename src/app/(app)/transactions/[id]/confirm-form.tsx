"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Transaction, TransactionType } from "@/lib/types";
import { currencySymbol, formatFullDate, formatMoney, formatTime } from "@/lib/format";
import { confirmTransaction, deleteTransaction, restoreTransaction } from "@/lib/actions";
import { BackIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";

/** Date UTC → valor para <input type="datetime-local"> en hora local. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ConfirmForm({ tx, categories }: { tx: Transaction; categories: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const suggested = tx.category ?? tx.ai_suggested_category;
  const [category, setCategory] = useState<string | null>(suggested);
  const [notes, setNotes] = useState(tx.notes ?? "");
  // Modo edición: expone monto, comercio, fecha y tipo — antes solo el
  // monto era corregible y un "EDEESTE 8184" feo o una fecha mal parseada
  // no tenían arreglo desde la UI.
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(tx.amount.toFixed(2));
  const [merchant, setMerchant] = useState(tx.merchant);
  const [dateStr, setDateStr] = useState(toLocalInput(new Date(tx.date)));
  const [type, setType] = useState<TransactionType>(tx.type);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDeleting] = useTransition();

  const date = new Date(tx.date);
  const isExpense = type === "expense";
  const symbol = currencySymbol(tx.currency);
  const isForeign = tx.currency !== "DOP";

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
      const editedDateIso = new Date(dateStr).toISOString();
      const result = await confirmTransaction({
        id: tx.id,
        category,
        notes: notes || undefined,
        // Solo manda lo que de verdad cambió en modo edición
        amount: editing && Number(amount) !== tx.amount ? amount : undefined,
        merchant: editing && merchant.trim() !== tx.merchant ? merchant : undefined,
        date: editing && editedDateIso !== tx.date ? editedDateIso : undefined,
        type: editing && type !== tx.type ? type : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      toast(tx.confirmed ? "✓ Cambios guardados" : "✓ Transacción confirmada");
      router.push("/transactions");
      router.refresh();
    });
  };

  const handleDelete = () => {
    setError(null);
    startDeleting(async () => {
      const result = await deleteTransaction(tx.id);
      if (!result.ok) {
        setError(result.error ?? "No se pudo eliminar");
        setConfirmingDelete(false);
        return;
      }
      setConfirmingDelete(false);
      // Deshacer barato: eliminar es soft delete, restaurar limpia deleted_at
      toast("Transacción eliminada", "success", {
        label: "Deshacer",
        onAction: () => {
          restoreTransaction(tx.id).then((r) => {
            toast(r.ok ? "✓ Transacción restaurada" : (r.error ?? "No se pudo restaurar"));
            router.refresh();
          });
        },
      });
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
        {editing ? (
          <div className="mx-auto flex w-fit rounded-btn border border-line bg-surface p-1">
            {(
              [
                ["expense", "Gasto"],
                ["income", "Ingreso"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={`rounded-[9px] px-4 py-1.5 text-[12px] font-bold transition ${
                  type === value
                    ? value === "expense"
                      ? "bg-expense text-white"
                      : "bg-income text-white"
                    : "text-ink-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {isExpense ? "Gasto" : "Ingreso"}
          </div>
        )}
        {editing ? (
          <div className="mt-3 flex items-baseline justify-center gap-1.5">
            <span className="text-base font-bold text-ink-muted">{symbol}</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className="w-44 border-b-2 border-accent bg-transparent text-center text-4xl font-extrabold tracking-tighter text-ink outline-none"
            />
          </div>
        ) : (
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-base font-bold text-ink-muted">{symbol}</span>
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
        {isForeign && tx.exchange_rate !== null && (
          <div className="mt-2 text-[13px] font-medium text-ink-muted">
            ≈ {formatMoney(Number(amount) * tx.exchange_rate)} · tasa del día{" "}
            {tx.exchange_rate.toFixed(2)}
          </div>
        )}
        {!editing && <div className="mt-2.5 text-sm font-medium text-ink-muted">{tx.merchant}</div>}
      </div>

      {/* Datos */}
      {editing ? (
        <section className="mx-5 flex flex-col gap-3 rounded-card border border-line bg-card p-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Comercio
            </label>
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              Fecha y hora
            </label>
            <input
              type="datetime-local"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
        </section>
      ) : (
        <section className="mx-5 overflow-hidden rounded-card border border-line bg-card">
          {(
            [
              ["Comercio", tx.merchant],
              ["Fecha", formatFullDate(date)],
              ["Hora", formatTime(date)],
              ["Tarjeta", tx.card_last4 ? `•••• ${tx.card_last4}` : "—"],
              [
                "Origen",
                tx.source === "email"
                  ? "✉️ Correo del banco"
                  : tx.source === "voice"
                    ? "🎤 Atajo de voz"
                    : tx.source === "manual"
                      ? "✋ Manual"
                      : "—",
              ],
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
      )}

      {/* Categoría */}
      <div className="flex items-center gap-1.5 px-5 pb-2.5 pt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink">Categoría</h2>
        {tx.ai_suggested_category && (
          <span className="rounded-[4px] bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent">
            IA
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 px-5 pb-1">
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
          onClick={() => setEditing((v) => !v)}
          className="mt-1.5 w-full py-3 text-[13px] font-semibold text-accent"
        >
          {editing ? "Cancelar edición" : "Editar transacción"}
        </button>

        <button
          onClick={() => setConfirmingDelete(true)}
          className="mt-1 w-full py-3 text-[13px] font-semibold text-expense"
        >
          Eliminar transacción
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="¿Eliminar esta transacción?"
        description={`${tx.merchant} · ${formatMoney(tx.amount, tx.currency)}. Podrás deshacerlo justo después.`}
        confirmLabel="Eliminar"
        pending={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </main>
  );
}
