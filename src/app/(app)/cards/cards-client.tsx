"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Card, CardType, CardWithSpend, Currency, UnregisteredCard } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { createCard, deleteCard, updateCard } from "@/lib/actions";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ChevronIcon, CreditCardIcon, PencilIcon, TrashIcon } from "@/components/icons";

const COLOR_PRESETS = [
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#0F172A",
];

const TYPE_LABEL: Record<CardType, string> = { debit: "Débito", credit: "Crédito" };

export function CardsClient({
  cards,
  unregistered,
  currency,
  demoMode,
}: {
  cards: CardWithSpend[];
  unregistered: UnregisteredCard[];
  currency: Currency;
  demoMode?: boolean;
}) {
  // null = sin formulario; "new" = alta en blanco; string = alta con ese
  // last4 predetectado; Card = edición
  const [form, setForm] = useState<"new" | string | Card | null>(null);

  const total = cards.reduce((sum, c) => sum + c.spent, 0);

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Tarjetas</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {cards.length === 0
            ? "Ponle nombre a tus tarjetas para ver cuánto gastas con cada una."
            : `Gastaste ${formatMoney(total, currency)} este mes con tus tarjetas.`}
        </p>
      </div>

      {/* Tarjetas registradas */}
      {cards.length > 0 && (
        <section className="mx-5 mb-3.5 flex flex-col gap-2.5">
          {cards.map(({ card, spent, count }) => (
            <CardRow
              key={card.id}
              card={card}
              spent={spent}
              count={count}
              currency={currency}
              onEdit={() => setForm(card)}
              demoMode={demoMode}
            />
          ))}
        </section>
      )}

      {/* Auto-descubrimiento: last4 vistos en las transacciones sin registrar */}
      {unregistered.length > 0 && form === null && (
        <section className="mx-5 mb-3.5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Detectadas en tus transacciones
          </h2>
          <ul className="overflow-hidden rounded-card border border-line bg-card">
            {unregistered.map((item, i) => (
              <li
                key={item.last4}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i < unregistered.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-background text-ink-muted">
                  <CreditCardIcon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink">
                    •••• {item.last4}
                  </span>
                  <span className="block text-[11px] text-ink-muted">
                    {item.count} {item.count === 1 ? "movimiento" : "movimientos"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setForm(item.last4)}
                  disabled={demoMode}
                  className="shrink-0 rounded-btn border border-accent/30 bg-accent/5 px-3.5 py-2 text-[12px] font-bold text-accent disabled:opacity-50"
                >
                  Ponerle nombre
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Alta / edición */}
      <section className="mx-5 mb-6">
        {form === null ? (
          <button
            type="button"
            onClick={() => setForm("new")}
            disabled={demoMode}
            className="w-full rounded-btn border border-dashed border-line py-3 text-[13px] font-semibold text-accent disabled:opacity-50"
          >
            + Agregar tarjeta
          </button>
        ) : typeof form === "string" ? (
          <CardForm
            key={form}
            mode="new"
            presetLast4={form === "new" ? "" : form}
            onClose={() => setForm(null)}
            demoMode={demoMode}
          />
        ) : (
          <CardForm
            key={form.id}
            mode="edit"
            card={form}
            onClose={() => setForm(null)}
            demoMode={demoMode}
          />
        )}

        {cards.length === 0 && unregistered.length === 0 && (
          <p className="mt-3 px-1 text-center text-[12px] leading-relaxed text-ink-muted">
            Las transacciones que llegan de tus bancos ya traen los últimos 4 dígitos, así que en
            cuanto registres una tarjeta verás su historial completo.
          </p>
        )}
      </section>
    </main>
  );
}

/** Tarjeta registrada, con su gasto del mes. Lleva a sus transacciones. */
function CardRow({
  card,
  spent,
  count,
  currency,
  onEdit,
  demoMode,
}: {
  card: Card;
  spent: number;
  count: number;
  currency: Currency;
  onEdit: () => void;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, startDeleting] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteCard(card.id);
      if (!result.ok) {
        toast(result.error ?? "No se pudo eliminar", "error");
        setConfirming(false);
        return;
      }
      toast("Tarjeta eliminada");
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card">
      <Link
        href={`/transactions?card=${card.last4}`}
        className="flex items-center gap-3 px-4 py-3.5 transition active:bg-background"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-white"
          style={{ backgroundColor: card.color }}
        >
          <CreditCardIcon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold tracking-tight text-ink">
            {card.nickname}
          </span>
          <span className="block text-[11px] text-ink-muted">
            {TYPE_LABEL[card.type]} · •••• {card.last4}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[14px] font-bold tracking-tight text-ink">
            {formatMoney(spent, currency)}
          </span>
          <span className="block text-[10px] text-ink-muted">
            {count === 0 ? "sin gastos este mes" : `${count} este mes`}
          </span>
        </span>
        <ChevronIcon className="shrink-0 text-ink-muted" />
      </Link>

      <div className="flex justify-end gap-1 border-t border-line px-2 py-1.5">
        <button
          type="button"
          onClick={onEdit}
          disabled={deleting || demoMode}
          aria-label={`Editar ${card.nickname}`}
          className="flex h-8 w-8 items-center justify-center rounded-pill text-ink-muted transition active:bg-background disabled:opacity-50"
        >
          <PencilIcon size={18} />
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={deleting || demoMode}
          aria-label={`Eliminar ${card.nickname}`}
          className="flex h-8 w-8 items-center justify-center rounded-pill text-ink-muted transition active:bg-background disabled:opacity-50"
        >
          <TrashIcon size={18} />
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`¿Eliminar "${card.nickname}"?`}
        description="Solo se quita el nombre: tus transacciones no se tocan y la tarjeta volverá a aparecer como detectada."
        confirmLabel="Eliminar"
        pending={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/** Formulario compartido por alta y edición. */
function CardForm({
  mode,
  card,
  presetLast4,
  onClose,
  demoMode,
}: {
  mode: "new" | "edit";
  card?: Card;
  presetLast4?: string;
  onClose: () => void;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [last4, setLast4] = useState(card?.last4 ?? presetLast4 ?? "");
  const [nickname, setNickname] = useState(card?.nickname ?? "");
  const [type, setType] = useState<CardType>(card?.type ?? "debit");
  const [color, setColor] = useState(card?.color ?? COLOR_PRESETS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result =
        mode === "edit" && card
          ? await updateCard({ id: card.id, nickname: nickname.trim(), type, color })
          : await createCard({ last4, nickname: nickname.trim(), type, color });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      toast(mode === "edit" ? "✓ Tarjeta actualizada" : "✓ Tarjeta agregada");
      onClose();
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";
  const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink";

  return (
    <div className="rounded-card border border-line bg-card p-4">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink">
        {mode === "edit" ? "Editar tarjeta" : "Nueva tarjeta"}
      </h3>

      {/* Vista previa */}
      <div className="mb-4 flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-pill text-white"
          style={{ backgroundColor: color }}
        >
          <CreditCardIcon size={18} />
        </span>
        <span>
          <span className="block text-[14px] font-bold text-ink">
            {nickname.trim() || "Tu tarjeta"}
          </span>
          <span className="block text-[11px] text-ink-muted">
            {TYPE_LABEL[type]} · •••• {last4 || "0000"}
          </span>
        </span>
      </div>

      <label className={labelClass}>Últimos 4 dígitos</label>
      <input
        value={last4}
        onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
        type="text"
        inputMode="numeric"
        placeholder="3326"
        disabled={mode === "edit"}
        className={`${inputClass} disabled:opacity-60`}
      />
      {mode === "edit" && (
        <p className="mt-1 text-[11px] text-ink-muted">
          No se puede cambiar: es lo que vincula la tarjeta con tus transacciones.
        </p>
      )}

      <label className={`${labelClass} mt-4`}>Nombre</label>
      <input
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Ej. Visa Popular"
        maxLength={30}
        autoFocus
        className={inputClass}
      />

      <label className={`${labelClass} mt-4`}>Tipo</label>
      <div className="flex rounded-btn border border-line bg-surface p-1">
        {(["debit", "credit"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setType(value)}
            className={`flex-1 rounded-[9px] py-2 text-[13px] font-bold transition ${
              type === value ? "bg-accent text-white" : "text-ink-muted"
            }`}
          >
            {TYPE_LABEL[value]}
          </button>
        ))}
      </div>

      <label className={`${labelClass} mt-4`}>Color</label>
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            style={{ backgroundColor: c }}
            className={`h-8 w-8 rounded-pill transition ${
              color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""
            }`}
          />
        ))}
      </div>

      {error && <p className="mt-3 text-xs font-medium text-expense">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-semibold text-ink-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nickname.trim() || last4.length !== 4 || demoMode}
          className="flex-[1.5] rounded-btn bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Agregar tarjeta"}
        </button>
      </div>
    </div>
  );
}
