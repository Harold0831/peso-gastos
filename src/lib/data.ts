import "server-only";
import { cache } from "react";
import { endOfMonth, startOfMonth } from "date-fns";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { getHomeCurrencyForUser, requireUserId } from "./users";
import { getLatestCachedRate } from "./exchange-rate";
import { MOCK_BUDGETS, MOCK_CATEGORIES, MOCK_GOALS, MOCK_TRANSACTIONS } from "./mock-data";
import type { Budget, Category, Currency, SavingsGoal, Transaction } from "./types";

/**
 * Capa de lectura de datos, siempre acotada al usuario de la sesión
 * (multi-usuario). Cuando Supabase no está configurado (dev local sin
 * credenciales) devuelve datos mock para que toda la UI sea navegable.
 */

export interface MonthSummary {
  income: number;
  expenses: number;
  net: number;
}

export interface BudgetWithSpend {
  budget: Budget;
  category: Category;
  spent: number;
}

export interface CategorySpend {
  category: Category;
  amount: number;
}

function monthRange(month: Date): { from: string; to: string } {
  return {
    from: startOfMonth(month).toISOString(),
    to: endOfMonth(month).toISOString(),
  };
}

/**
 * Moneda de casa del usuario en sesión (en la que ve totales/gráficas).
 * Cacheada por request (`react.cache`) para no repetir el query en cada
 * agregación de la misma página. En modo demo, DOP.
 */
export const getHomeCurrency = cache(async (): Promise<Currency> => {
  if (!isSupabaseConfigured()) return "DOP";
  return getHomeCurrencyForUser(await requireUserId());
});

/**
 * Convertidor de montos a la moneda de casa del usuario para totales y
 * gráficas. Las transacciones ya en esa moneda pasan tal cual (el caso de
 * un usuario 100% EUR o 100% DOP: cero conversión). Las de otra moneda usan
 * la tasa estampada al sincronizarlas (exchange_rate); las históricas sin
 * tasa (pre-migración 0004) caen a la última tasa cacheada. Último recurso
 * (sin tasa alguna): el monto se suma tal cual.
 *
 * Nota: la tasa cacheada es USD→DOP, así que la conversión cross-moneda
 * solo es exacta para un usuario de casa DOP con gastos en USD (el caso de
 * Harold). Un usuario EUR con gastos en otra moneda caería al fallback —
 * hoy nadie está en ese caso (la captura por voz siempre usa EUR).
 */
async function homeConverter(
  rows: Transaction[],
  home: Currency,
): Promise<(t: Transaction) => number> {
  const needsFallback = rows.some((t) => t.currency !== home && t.exchange_rate === null);
  const fallback = needsFallback ? await getLatestCachedRate() : null;
  return (t) => (t.currency === home ? t.amount : t.amount * (t.exchange_rate ?? fallback ?? 1));
}

export async function getTransactions(options?: {
  month?: Date;
  limit?: number;
}): Promise<Transaction[]> {
  if (!isSupabaseConfigured()) {
    let rows = MOCK_TRANSACTIONS.filter((t) => !t.deleted_at);
    if (options?.month) {
      const { from, to } = monthRange(options.month);
      rows = rows.filter((t) => t.date >= from && t.date <= to);
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return options?.limit ? rows.slice(0, options.limit) : rows;
  }

  let query = getSupabaseAdmin()
    .from("transactions")
    .select("*")
    .eq("user_id", await requireUserId())
    .is("deleted_at", null)
    .order("date", { ascending: false });
  if (options?.month) {
    const { from, to } = monthRange(options.month);
    query = query.gte("date", from).lte("date", to);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Error cargando transacciones: ${error.message}`);
  return (data ?? []).map(normalizeTransaction);
}

export async function getTransactionById(id: string): Promise<Transaction | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_TRANSACTIONS.find((t) => t.id === id && !t.deleted_at) ?? null;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", await requireUserId())
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Error cargando transacción: ${error.message}`);
  return data ? normalizeTransaction(data) : null;
}

export async function getPendingCount(): Promise<number> {
  if (!isSupabaseConfigured()) {
    return MOCK_TRANSACTIONS.filter((t) => !t.confirmed && !t.deleted_at).length;
  }
  const { count, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", await requireUserId())
    .eq("confirmed", false)
    .is("deleted_at", null);
  if (error) throw new Error(`Error contando pendientes: ${error.message}`);
  return count ?? 0;
}

export async function getMonthSummary(month: Date): Promise<MonthSummary> {
  const rows = await getTransactions({ month });
  const toHome = await homeConverter(rows, await getHomeCurrency());
  const income = rows.filter((t) => t.type === "income").reduce((s, t) => s + toHome(t), 0);
  const expenses = rows.filter((t) => t.type === "expense").reduce((s, t) => s + toHome(t), 0);
  return { income, expenses, net: income - expenses };
}

export async function getCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return MOCK_CATEGORIES;
  const { data, error } = await getSupabaseAdmin().from("categories").select("*").order("name");
  if (error) throw new Error(`Error cargando categorías: ${error.message}`);
  return data ?? [];
}

export async function getBudgetsForMonth(month: Date): Promise<BudgetWithSpend[]> {
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
  const [categories, transactions] = await Promise.all([
    getCategories(),
    getTransactions({ month }),
  ]);

  let budgets: Budget[];
  if (!isSupabaseConfigured()) {
    budgets = MOCK_BUDGETS.filter((b) => b.month === monthKey);
  } else {
    const { data, error } = await getSupabaseAdmin()
      .from("budgets")
      .select("*")
      .eq("user_id", await requireUserId())
      .eq("month", monthKey);
    if (error) throw new Error(`Error cargando presupuestos: ${error.message}`);
    budgets = (data ?? []).map((b) => ({ ...b, limit_amount: Number(b.limit_amount) }));
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const toHome = await homeConverter(transactions, await getHomeCurrency());
  return budgets
    .map((budget) => {
      const category = byId.get(budget.category_id);
      if (!category) return null;
      const spent = transactions
        .filter((t) => t.type === "expense" && t.category === category.name)
        .reduce((s, t) => s + toHome(t), 0);
      return { budget, category, spent };
    })
    .filter((b): b is BudgetWithSpend => b !== null);
}

export async function getGoals(): Promise<SavingsGoal[]> {
  if (!isSupabaseConfigured()) return MOCK_GOALS;
  const { data, error } = await getSupabaseAdmin()
    .from("savings_goals")
    .select("*")
    .eq("user_id", await requireUserId())
    .order("created_at");
  if (error) throw new Error(`Error cargando metas: ${error.message}`);
  return (data ?? []).map((g) => ({
    ...g,
    target_amount: Number(g.target_amount),
    current_amount: Number(g.current_amount),
  }));
}

/** Gasto por categoría del mes, ordenado descendente. Incluye solo categorías con gasto. */
export async function getCategorySpend(month: Date): Promise<CategorySpend[]> {
  const [categories, transactions] = await Promise.all([
    getCategories(),
    getTransactions({ month }),
  ]);
  const totals = new Map<string, number>();
  const toHome = await homeConverter(transactions, await getHomeCurrency());
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const name = t.category ?? t.ai_suggested_category ?? "Otros";
    totals.set(name, (totals.get(name) ?? 0) + toHome(t));
  }
  const byName = new Map(categories.map((c) => [c.name, c]));
  const fallback = (name: string): Category => ({
    id: name,
    name,
    icon: "📌",
    color: "#9CA3AF",
    is_default: false,
  });
  return [...totals.entries()]
    .map(([name, amount]) => ({ category: byName.get(name) ?? fallback(name), amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Gasto por día del mes (índice 0 = día 1) para el bar chart. */
export async function getDailyExpenses(month: Date): Promise<number[]> {
  const transactions = await getTransactions({ month });
  const days = endOfMonth(month).getDate();
  const result = new Array<number>(days).fill(0);
  const toHome = await homeConverter(transactions, await getHomeCurrency());
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    result[new Date(t.date).getDate() - 1] += toHome(t);
  }
  return result;
}

export interface AttentionItem {
  id: string;
  icon: string;
  title: string;
  detail: string;
  href: string;
  kind: "gmail" | "budget" | "pending";
}

/**
 * Bandeja de notificaciones in-app (la campanita del dashboard). Se DERIVA
 * del estado actual en vez de persistirse: nunca muestra avisos viejos ya
 * resueltos ni necesita marcar-como-leído — si algo aparece aquí, sigue
 * requiriendo atención; cuando se resuelve, desaparece solo.
 * Orden: roturas (Gmail) → presupuestos excedidos/en riesgo → pendientes.
 */
export async function getAttentionItems(): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const now = new Date();

  // Import diferido: users.ts es server-only y depende de la sesión
  const { formatMoney } = await import("./format");

  if (isSupabaseConfigured()) {
    const { getGmailStatus } = await import("./users");
    const gmail = await getGmailStatus(await requireUserId());
    if (gmail.linked && !gmail.syncEnabled) {
      items.push({
        id: "gmail-expired",
        icon: "✉️",
        title: "El acceso a tu Gmail expiró",
        detail: "Reconéctalo para que tus transacciones sigan llegando",
        href: "/profile",
        kind: "gmail",
      });
    }
  }

  const [budgets, transactions, home] = await Promise.all([
    getBudgetsForMonth(now),
    getTransactions(),
    getHomeCurrency(),
  ]);

  for (const { budget, category, spent } of budgets) {
    const pct = budget.limit_amount > 0 ? spent / budget.limit_amount : 0;
    if (pct >= 1) {
      items.push({
        id: `budget-over-${category.id}`,
        icon: "🚨",
        title: `Presupuesto de ${category.name} excedido`,
        detail: `${formatMoney(spent, home)} de ${formatMoney(budget.limit_amount, home)}`,
        href: "/budget",
        kind: "budget",
      });
    } else if (pct >= 0.8) {
      items.push({
        id: `budget-warn-${category.id}`,
        icon: "⚠️",
        title: `Presupuesto de ${category.name} al ${Math.round(pct * 100)}%`,
        detail: `${formatMoney(spent, home)} de ${formatMoney(budget.limit_amount, home)}`,
        href: "/budget",
        kind: "budget",
      });
    }
  }

  for (const t of transactions.filter((t) => !t.confirmed)) {
    items.push({
      id: `pending-${t.id}`,
      icon: "⏳",
      title: t.merchant,
      detail: `${formatMoney(t.amount, t.currency)} · por confirmar`,
      href: `/transactions/${t.id}`,
      kind: "pending",
    });
  }

  return items;
}

/** Supabase devuelve decimals como string; normaliza a number. */
function normalizeTransaction(row: Record<string, unknown>): Transaction {
  const t = row as unknown as Transaction;
  return {
    ...t,
    amount: Number(t.amount),
    exchange_rate: t.exchange_rate === null ? null : Number(t.exchange_rate),
    available_balance: t.available_balance === null ? null : Number(t.available_balance),
  };
}
