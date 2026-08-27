"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import type { Currency, SavingsGoal } from "@/lib/types";
import { currencySymbol, formatMoney } from "@/lib/format";
import {
  contributeToGoal,
  createGoal,
  deleteGoal,
  updateGoal,
  withdrawFromGoal,
} from "@/lib/actions";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function GoalsList({ goals, currency }: { goals: SavingsGoal[]; currency: Currency }) {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Metas de ahorro</h1>
      </div>
      <div className="flex flex-col gap-3 px-5">
        {goals.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-muted">
            Sin metas todavía. Crea la primera abajo.
          </p>
        )}
        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} currency={currency} />
        ))}
        <NewGoalForm currency={currency} />
      </div>
    </main>
  );
}

function GoalCard({ goal, currency }: { goal: SavingsGoal; currency: Currency }) {
  const router = useRouter();
  const toast = useToast();
  // null = sin formulario abierto; si no, qué movimiento se está registrando
  const [mode, setMode] = useState<"contribute" | "withdraw" | null>(null);
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const pct = Math.min(goal.current_amount / goal.target_amount, 1);
  const completed = goal.current_amount >= goal.target_amount;
  const daysLeft = goal.deadline
    ? differenceInCalendarDays(new Date(goal.deadline), new Date())
    : null;

  const withdrawing = mode === "withdraw";

  const handleAmount = () => {
    setError(null);
    startSaving(async () => {
      const result = withdrawing
        ? await withdrawFromGoal({ goal_id: goal.id, amount })
        : await contributeToGoal({ goal_id: goal.id, amount });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      toast(withdrawing ? "✓ Retiro guardado" : "✓ Abono guardado");
      setMode(null);
      setAmount("");
      router.refresh();
    });
  };

  return (
    <div
      className={`rounded-card border bg-card p-5 shadow-card ${
        completed ? "animate-goal-pop border-income/40" : "border-line"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-pill text-lg"
            style={{ backgroundColor: `${goal.color}1A` }}
          >
            {goal.icon}
          </span>
          <div>
            <div className="text-sm font-bold tracking-tight text-ink">{goal.name}</div>
            <div className="text-[11px] font-medium text-ink-muted">
              {completed
                ? "🎉 ¡Meta completada!"
                : daysLeft === null
                  ? "Sin fecha límite"
                  : daysLeft < 0
                    ? "Fecha límite vencida"
                    : `${daysLeft} ${daysLeft === 1 ? "día restante" : "días restantes"}`}
            </div>
          </div>
        </div>
        <span className="text-xs font-bold tracking-tight text-ink-muted">
          {Math.round(pct * 100)}%
        </span>
      </div>

      <div className="mb-2 h-2 overflow-hidden rounded-pill bg-background">
        <div
          className="h-full rounded-pill transition-[width]"
          style={{
            width: `${pct * 100}%`,
            backgroundColor: completed ? "var(--income)" : goal.color,
          }}
        />
      </div>
      <p className="text-[11px] font-medium text-ink-muted">
        <span className="font-semibold text-ink">{formatMoney(goal.current_amount, currency)}</span>{" "}
        de {formatMoney(goal.target_amount, currency)}
      </p>

      {mode ? (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Monto a ${withdrawing ? "retirar" : "abonar"} (${currencySymbol(currency)})`}
            autoFocus
            className="min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
          />
          <button
            onClick={() => {
              setMode(null);
              setError(null);
            }}
            aria-label="Cancelar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border border-line text-[13px] font-semibold text-ink"
          >
            ✕
          </button>
          <button
            onClick={handleAmount}
            disabled={saving || !amount}
            className={`rounded-btn px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50 ${
              withdrawing ? "bg-expense" : "bg-accent"
            }`}
          >
            {saving ? "…" : withdrawing ? "Retirar" : "Abonar"}
          </button>
        </div>
      ) : (
        /* Una meta completada ya no admite abonos, pero sí retirar (gastaste
           parte de lo ahorrado) y editar/eliminar — antes se quedaba sin
           ninguna acción posible. */
        <div className="mt-3 flex gap-2">
          {!completed && (
            <button
              onClick={() => setMode("contribute")}
              className="flex-1 rounded-btn border border-accent/30 bg-accent/5 py-2.5 text-[13px] font-bold text-accent"
            >
              + Abonar
            </button>
          )}
          {goal.current_amount > 0 && (
            <button
              onClick={() => setMode("withdraw")}
              className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-bold text-ink"
            >
              − Retirar
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            aria-label={`Editar ${goal.name}`}
            className="flex h-[38px] w-11 shrink-0 items-center justify-center rounded-btn border border-line text-[13px]"
          >
            ✏️
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs font-medium text-expense">{error}</p>}

      <EditGoalDialog
        goal={goal}
        currency={currency}
        open={editing}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

/**
 * Edición completa de una meta: nombre, ícono, objetivo, fecha y —lo que
 * faltaba— el monto ya ahorrado, además de eliminarla. Sin esto, una meta
 * creada con un error o de la que se gastó parte del ahorro no tenía arreglo.
 */
function EditGoalDialog({
  goal,
  currency,
  open,
  onClose,
}: {
  goal: SavingsGoal;
  currency: Currency;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(String(goal.target_amount));
  const [saved, setSaved] = useState(String(goal.current_amount));
  const [deadline, setDeadline] = useState(goal.deadline?.slice(0, 10) ?? "");
  const [icon, setIcon] = useState(goal.icon);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, startDeleting] = useTransition();

  // Al abrir, parte siempre de los valores actuales de la meta (pudo cambiar
  // por un abono o un retiro desde la tarjeta).
  useEffect(() => {
    if (!open) return;
    setName(goal.name);
    setTarget(String(goal.target_amount));
    setSaved(String(goal.current_amount));
    setDeadline(goal.deadline?.slice(0, 10) ?? "");
    setIcon(goal.icon);
    setError(null);
  }, [open, goal]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await updateGoal({
        id: goal.id,
        name,
        target_amount: target,
        current_amount: saved,
        deadline: deadline || undefined,
        icon,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      toast("✓ Meta actualizada");
      onClose();
      router.refresh();
    });
  };

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteGoal(goal.id);
      if (!result.ok) {
        toast(result.error ?? "No se pudo eliminar", "error");
        setConfirmingDelete(false);
        return;
      }
      toast("Meta eliminada");
      setConfirmingDelete(false);
      onClose();
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";
  const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Editar ${goal.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        aria-label="Cancelar"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 bg-black/40"
      />
      <div className="animate-screen-in relative z-10 mx-4 mb-6 max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-card border border-line bg-card p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:mb-0">
        <h2 className="text-[16px] font-bold tracking-tight text-ink">Editar meta</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {GOAL_ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              className={`flex h-9 w-9 items-center justify-center rounded-pill border text-base transition ${
                icon === i ? "border-accent bg-accent/10" : "border-line bg-surface"
              }`}
            >
              {i}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className={labelClass}>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>

        <div className="mt-3">
          <label className={labelClass}>Monto objetivo ({currencySymbol(currency)})</label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            type="text"
            inputMode="decimal"
            className={inputClass}
          />
        </div>

        <div className="mt-3">
          <label className={labelClass}>Ahorrado hasta ahora ({currencySymbol(currency)})</label>
          <input
            value={saved}
            onChange={(e) => setSaved(e.target.value)}
            type="text"
            inputMode="decimal"
            className={inputClass}
          />
          <p className="mt-1 text-[11px] text-ink-muted">
            Corrígelo si gastaste parte de lo ahorrado. Puede quedar en 0.
          </p>
        </div>

        <div className="mt-3">
          <label className={labelClass}>Fecha límite (opcional)</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={inputClass}
          />
        </div>

        {error && <p className="mt-3 text-xs font-medium text-expense">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-btn border border-line py-3 text-[13px] font-semibold text-ink disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !target}
            className="flex-1 rounded-btn bg-accent py-3 text-[13px] font-bold text-white disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>

        <button
          onClick={() => setConfirmingDelete(true)}
          disabled={saving || deleting}
          className="mt-2 w-full py-2.5 text-center text-[13px] font-semibold text-expense disabled:opacity-50"
        >
          Eliminar meta
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title={`¿Eliminar "${goal.name}"?`}
        description="Se borra la meta y lo que llevabas ahorrado en ella. Tus transacciones no se tocan."
        confirmLabel="Eliminar"
        pending={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

const GOAL_ICONS = ["🎯", "🛟", "📱", "🏝️", "🚗", "🏠", "🎓", "💻"];

function NewGoalForm({ currency }: { currency: Currency }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-4 mt-1 rounded-[14px] border-[1.5px] border-dashed border-line py-3.5 text-[13px] font-semibold text-ink-muted"
      >
        + Nueva meta
      </button>
    );
  }

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await createGoal({
        name,
        target_amount: target,
        deadline: deadline || undefined,
        icon,
      });
      if (!result.ok) {
        setError(result.error ?? "No se pudo crear la meta");
        return;
      }
      toast("✓ Meta creada");
      setOpen(false);
      setName("");
      setTarget("");
      setDeadline("");
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

  return (
    <div className="mb-4 mt-1 rounded-card border border-line bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink">Nueva meta</h3>
      <div className="mb-3 flex gap-2">
        {GOAL_ICONS.map((i) => (
          <button
            key={i}
            onClick={() => setIcon(i)}
            className={`flex h-9 w-9 items-center justify-center rounded-pill border text-base transition ${
              icon === i ? "border-accent bg-accent/10" : "border-line bg-surface"
            }`}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la meta"
          className={inputClass}
        />
        <input
          type="text"
          inputMode="decimal"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={`Monto objetivo (${currencySymbol(currency)})`}
          className={inputClass}
        />
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && <p className="mt-2 text-xs font-medium text-expense">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-semibold text-ink"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name || !target}
          className="flex-1 rounded-btn bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Crear meta"}
        </button>
      </div>
    </div>
  );
}
