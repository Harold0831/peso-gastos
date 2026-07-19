"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMonths, subMonths } from "date-fns";
import type { Transaction } from "@/lib/types";
import { formatDayLabel, formatMonthLabel } from "@/lib/format";
import { confirmTransactionsBulk, syncNow } from "@/lib/actions";
import { TxRow } from "@/components/tx-row";
import { RefreshIcon } from "@/components/icons";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { useToast } from "@/components/toast";

type Filter = "todos" | "gastos" | "ingresos" | "pendientes";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "gastos", label: "Gastos" },
  { id: "ingresos", label: "Ingresos" },
  { id: "pendientes", label: "Por confirmar" },
];

/** Estados vacíos accionables: "por confirmar" vacío es una buena noticia,
 *  y la lista vacía ofrece los dos caminos (manual o sync) en vez de un
 *  callejón sin salida. */
function EmptyState({
  filter,
  monthLabel,
  syncing,
  onSync,
}: {
  filter: Filter;
  monthLabel: string;
  syncing: boolean;
  onSync: () => void;
}) {
  if (filter === "pendientes") {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-2xl">🎉</p>
        <p className="mt-2 text-sm font-semibold text-ink">Nada por confirmar</p>
        <p className="mt-1 text-[13px] text-ink-muted">Todas tus transacciones están al día.</p>
      </div>
    );
  }
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-semibold text-ink">
        {filter === "todos"
          ? `Sin transacciones en ${monthLabel.toLowerCase()}`
          : "Nada por aquí con este filtro"}
      </p>
      <p className="mt-1 text-[13px] text-ink-muted">
        Llegarán solas desde tu correo, o agrega una a mano.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link
          href="/transactions/new"
          className="rounded-btn bg-accent px-4 py-2.5 text-[13px] font-bold text-white"
        >
          + Agregar gasto
        </Link>
        <button
          onClick={onSync}
          disabled={syncing}
          className="rounded-btn border border-line bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink disabled:opacity-50"
        >
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>
      </div>
    </div>
  );
}

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
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.id === initialFilter) ? (initialFilter as Filter) : "todos",
  );
  const [syncing, startSync] = useTransition();

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSaving, startBulkSaving] = useTransition();

  // Mes visible (con el historial creciendo, la lista plana se volvía
  // inmanejable) + filtro por categoría. "Por confirmar" ignora el mes a
  // propósito: una pendiente vieja no debe esconderse por cambiar de mes.
  const [month, setMonth] = useState(() => new Date());
  const [category, setCategory] = useState<string | null>(null);

  const pendingCount = transactions.filter((t) => !t.confirmed).length;

  const changeFilter = (next: Filter) => {
    setFilter(next);
    exitSelectionMode();
  };

  const filtered = useMemo(() => {
    let rows = transactions;
    switch (filter) {
      case "gastos":
        rows = rows.filter((t) => t.type === "expense");
        break;
      case "ingresos":
        rows = rows.filter((t) => t.type === "income");
        break;
      case "pendientes":
        rows = rows.filter((t) => !t.confirmed);
        break;
    }
    if (filter !== "pendientes") {
      rows = rows.filter((t) => {
        const d = new Date(t.date);
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
      });
    }
    if (category) {
      rows = rows.filter((t) => (t.category ?? t.ai_suggested_category) === category);
    }
    return rows;
  }, [transactions, filter, month, category]);

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
      toast(
        `✓ ${selectedIds.size} ${selectedIds.size === 1 ? "transacción confirmada" : "transacciones confirmadas"}`,
      );
      exitSelectionMode();
      router.refresh();
    });
  };

  const handleSync = () => {
    startSync(async () => {
      const result = await syncNow();
      if (!result.ok) {
        toast(result.error ?? "Error al sincronizar", "error");
      } else {
        toast(
          result.synced === 0
            ? "Sin transacciones nuevas"
            : `✓ ${result.synced} ${result.synced === 1 ? "nueva transacción" : "nuevas transacciones"}`,
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

        {/* Selector de mes (oculto en "Por confirmar": esa vista es global) */}
        {filter !== "pendientes" && (
          <div className="flex items-center justify-center gap-2 pb-3">
            <button
              onClick={() => setMonth((m) => subMonths(m, 1))}
              aria-label="Mes anterior"
              className="flex h-9 w-9 items-center justify-center text-lg text-ink-muted"
            >
              ‹
            </button>
            <span className="min-w-32 text-center text-[14px] font-bold tracking-tight text-ink">
              {formatMonthLabel(month)}
            </span>
            <button
              onClick={() => setMonth((m) => addMonths(m, 1))}
              aria-label="Mes siguiente"
              className="flex h-9 w-9 items-center justify-center text-lg text-ink-muted"
            >
              ›
            </button>
          </div>
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

        {/* Chips de categoría (scroll: son filtros opcionales, no un menú) */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-3">
          <button
            onClick={() => setCategory(null)}
            className={`shrink-0 rounded-pill border px-3 py-1.5 text-[11px] font-semibold transition ${
              category === null
                ? "border-accent bg-accent/10 text-accent"
                : "border-line bg-surface text-ink-muted"
            }`}
          >
            Todas
          </button>
          {categories.map((name) => (
            <button
              key={name}
              onClick={() => setCategory((c) => (c === name ? null : name))}
              className={`shrink-0 rounded-pill border px-3 py-1.5 text-[11px] font-semibold transition ${
                category === name
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-surface text-ink-muted"
              }`}
            >
              {name}
            </button>
          ))}
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
          <EmptyState
            filter={filter}
            monthLabel={formatMonthLabel(month)}
            syncing={syncing}
            onSync={handleSync}
          />
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
