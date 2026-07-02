"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "@/lib/types";
import { formatDayLabel } from "@/lib/format";
import { syncNow } from "@/lib/actions";
import { TxRow } from "@/components/tx-row";
import { RefreshIcon } from "@/components/icons";
import { PullToRefresh } from "@/components/pull-to-refresh";

type Filter = "todos" | "gastos" | "ingresos" | "pendientes";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "gastos", label: "Gastos" },
  { id: "ingresos", label: "Ingresos" },
  { id: "pendientes", label: "Por confirmar" },
];

export function TxList({
  transactions,
  initialFilter,
}: {
  transactions: Transaction[];
  initialFilter?: string;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.id === initialFilter) ? (initialFilter as Filter) : "todos",
  );
  const [syncing, startSync] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const pendingCount = transactions.filter((t) => !t.confirmed).length;

  const filtered = useMemo(() => {
    switch (filter) {
      case "gastos":
        return transactions.filter((t) => t.type === "expense");
      case "ingresos":
        return transactions.filter((t) => t.type === "income");
      case "pendientes":
        return transactions.filter((t) => !t.confirmed);
      default:
        return transactions;
    }
  }, [transactions, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const label = formatDayLabel(new Date(tx.date));
      const group = map.get(label) ?? [];
      group.push(tx);
      map.set(label, group);
    }
    return [...map.entries()];
  }, [filtered]);

  const handleSync = () => {
    setSyncMessage(null);
    startSync(async () => {
      const result = await syncNow();
      if (!result.ok) {
        setSyncMessage(result.error ?? "Error al sincronizar");
      } else {
        setSyncMessage(
          result.synced === 0
            ? "Sin correos nuevos"
            : `${result.synced} ${result.synced === 1 ? "transacción importada" : "transacciones importadas"}`,
        );
        router.refresh();
      }
    });
  };

  return (
    <PullToRefresh onRefresh={handleSync}>
      <main className="pt-safe">
        <div className="flex items-center justify-between px-5 py-4">
          <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Transacciones</h1>
          <button
            onClick={handleSync}
            disabled={syncing}
            aria-label="Sincronizar con Gmail"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-pill border border-line bg-surface text-ink disabled:opacity-50"
          >
            <RefreshIcon className={syncing ? "animate-spin" : undefined} />
          </button>
        </div>

        {syncMessage && (
          <p className="px-5 pb-2 text-xs font-medium text-ink-muted">{syncMessage}</p>
        )}

        {/* Filter chips */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-4">
          {FILTERS.map(({ id, label }) => {
            const active = filter === id;
            return (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-pill border px-3.5 py-2 text-xs font-semibold transition ${
                  active ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink"
                }`}
              >
                {label}
                {id === "pendientes" && pendingCount > 0 && (
                  <span
                    className={`min-w-4 rounded-lg px-1.5 py-px text-center text-[10px] font-bold ${
                      active ? "bg-surface text-ink" : "bg-accent text-white"
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {groups.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-ink-muted">
            No hay transacciones con este filtro.
          </p>
        ) : (
          groups.map(([day, items]) => (
            <section key={day} className="mb-3">
              <h2 className="px-5 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                {day}
              </h2>
              <div className="mx-5 overflow-hidden rounded-card border border-line bg-card">
                {items.map((tx, i) => (
                  <TxRow key={tx.id} tx={tx} divider={i < items.length - 1} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </PullToRefresh>
  );
}
