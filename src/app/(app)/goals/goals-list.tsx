"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import type { Currency, SavingsGoal } from "@/lib/types";
import { currencySymbol, formatMoney } from "@/lib/format";
import { contributeToGoal, createGoal } from "@/lib/actions";

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
  const [contributing, setContributing] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const pct = Math.min(goal.current_amount / goal.target_amount, 1);
  const completed = goal.current_amount >= goal.target_amount;
  const daysLeft = goal.deadline
    ? differenceInCalendarDays(new Date(goal.deadline), new Date())
    : null;

  const handleContribute = () => {
    setError(null);
    startSaving(async () => {
      const result = await contributeToGoal({ goal_id: goal.id, amount });
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar el abono");
        return;
      }
      setContributing(false);
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

      {!completed &&
        (contributing ? (
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Monto (${currencySymbol(currency)})`}
              autoFocus
              className="min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
            />
            <button
              onClick={() => setContributing(false)}
              aria-label="Cancelar abono"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-btn border border-line text-[13px] font-semibold text-ink"
            >
              ✕
            </button>
            <button
              onClick={handleContribute}
              disabled={saving || !amount}
              className="rounded-btn bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {saving ? "…" : "Abonar"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setContributing(true)}
            className="mt-3 w-full rounded-btn border border-accent/30 bg-accent/5 py-2.5 text-[13px] font-bold text-accent"
          >
            + Abonar
          </button>
        ))}
      {error && <p className="mt-2 text-xs font-medium text-expense">{error}</p>}
    </div>
  );
}

const GOAL_ICONS = ["🎯", "🛟", "📱", "🏝️", "🚗", "🏠", "🎓", "💻"];

function NewGoalForm({ currency }: { currency: Currency }) {
  const router = useRouter();
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
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
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
