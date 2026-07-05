"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Transaction } from "@/lib/types";
import { formatDayLabel } from "@/lib/format";
import { confirmTransactionsBulk, syncNow } from "@/lib/actions";
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
  categories,
}: {
  transactions: Transaction[];
  initialFilter?: string;
  categories: string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.id === initialFilter) ? (initialFilter as Filter) : "todos",
  );
  const [syncing, startSync] = useTransition();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSaving, startBulkSaving] = useTransition();

  const pendingCount = transactions.filter((t) => !t.confirmed).length;

  const changeFilter = (next: Filter) => {
    setFilter(next);
    exitSelectionMode();
  };

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

  // Grupos de 2+ pendientes con la misma categoría sugerida por IA — el
  // atajo que permite seleccionarlas todas de un tap en vez de una por una.
  const suggestedGroups = useMemo(() => {
    if (filter !== "pendientes") return [];
    const map = new Map<string, string[]>();
    for (const t of filtered) {
      const cat = t.ai_suggested_category ?? t.category;
      if (!cat) continue;
      const ids = map.get(cat) ?? [];
      ids.push(t.id);
      map.set(cat, ids);
    }
    return [...map.entries()]
      .filter(([, ids]) => ids.length >= 2)
      .sort((a, b) => b[1].length - a[1].length);
  }, [filtered, filter]);

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkCategory(null);
    setBulkError(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectSuggestedGroup(category: string, ids: string[]) {
    setSelectedIds(new Set(ids));
    setBulkCategory(category);
  }

  const handleBulkConfirm = () => {
    if (selectedIds.size === 0 || !bulkCategory) return;
    setBulkError(null);
    startBulkSaving(async () => {
      const result = await confirmTransactionsBulk({
        ids: [...selectedIds],
        category: bulkCategory,
      });
      if (!result.ok) {
        setBulkError(result.error ?? "No se pudo confirmar");
        return;
      }
      exitSelectionMode();
      router.refresh();
    });
  };

  const handleSync = () => {
    setSyncMessage(null);
    startSync(async () => {
      const result = await syncNow();
      if (!result.ok) {
        setSyncMessage(result.error ?? "Error al sincronizar");
      } else {
        setSyncMessage(
          result.synced === 0
            ? "Sin transacciones nuevas"
            : `${result.synced} ${result.synced === 1 ? "nueva transacción" : "nuevas transacciones"}`,
        );
        router.refresh();
      }
    });
  };

  return (
    <PullToRefresh onRefresh={handleSync}>
      <main className={selectionMode ? "pb-40 pt-safe" : "pt-safe"}>
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
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-3">
          {FILTERS.map(({ id, label }) => {
            const active = filter === id;
            return (
              <button
                key={id}
                onClick={() => changeFilter(id)}
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

        {filter === "pendientes" && filtered.length > 0 && (
          <div className="flex justify-end px-5 pb-3">
            <button
              onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
              className="text-[13px] font-semibold text-accent"
            >
              {selectionMode ? "Cancelar selección" : "Seleccionar varias"}
            </button>
          </div>
        )}

        {selectionMode && suggestedGroups.length > 0 && (
          <div className="flex flex-col gap-2 px-5 pb-3">
            {suggestedGroups.map(([category, ids]) => (
              <button
                key={category}
                onClick={() => selectSuggestedGroup(category, ids)}
                className="flex items-center justify-between rounded-btn border border-accent/30 bg-accent/5 px-3.5 py-2.5 text-left"
              >
                <span className="text-[13px] font-medium text-ink">
                  <span className="font-bold text-accent">{ids.length}</span> sugeridas como “
                  {category}”
                </span>
                <span className="text-[12px] font-bold text-accent">Seleccionar todas</span>
              </button>
            ))}
          </div>
        )}

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
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    divider={i < items.length - 1}
                    selectable={selectionMode}
                    selected={selectedIds.has(tx.id)}
                    onToggleSelect={() => toggleSelect(tx.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {selectionMode && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="mx-auto max-w-lg px-5 pt-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[13px] font-semibold text-ink">
                {selectedIds.size === 0
                  ? "Selecciona transacciones"
                  : `${selectedIds.size} ${selectedIds.size === 1 ? "seleccionada" : "seleccionadas"}`}
              </span>
              <button
                onClick={exitSelectionMode}
                className="text-[13px] font-semibold text-ink-muted"
              >
                Cancelar
              </button>
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-3">
              {categories.map((name) => {
                const active = bulkCategory === name;
                return (
                  <button
                    key={name}
                    onClick={() => setBulkCategory(name)}
                    className={`shrink-0 rounded-pill border px-3.5 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-surface text-ink"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {bulkError && <p className="pb-2 text-xs font-medium text-expense">{bulkError}</p>}
            <button
              onClick={handleBulkConfirm}
              disabled={selectedIds.size === 0 || !bulkCategory || bulkSaving}
              className="mb-3 w-full rounded-[14px] bg-accent py-3.5 text-[14px] font-bold tracking-tight text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition active:scale-[0.99] disabled:opacity-40"
            >
              {bulkSaving
                ? "Guardando…"
                : selectedIds.size > 0
                  ? `Confirmar ${selectedIds.size} ${selectedIds.size === 1 ? "transacción" : "transacciones"}`
                  : "Confirmar"}
            </button>
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}
