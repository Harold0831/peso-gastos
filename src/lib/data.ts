import "server-only";
import { endOfMonth, startOfMonth } from "date-fns";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { requireUserId } from "./users";
import { MOCK_BUDGETS, MOCK_CATEGORIES, MOCK_GOALS, MOCK_TRANSACTIONS } from "./mock-data";
import type { Budget, Category, SavingsGoal, Transaction } from "./types";

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
  const income = rows.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expenses = rows.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
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
  return budgets
    .map((budget) => {
      const category = byId.get(budget.category_id);
      if (!category) return null;
      const spent = transactions
        .filter((t) => t.type === "expense" && t.category === category.name)
        .reduce((s, t) => s + t.amount, 0);
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
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const name = t.category ?? t.ai_suggested_category ?? "Otros";
    totals.set(name, (totals.get(name) ?? 0) + t.amount);
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
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    result[new Date(t.date).getDate() - 1] += t.amount;
  }
  return result;
}

/** Supabase devuelve decimals como string; normaliza a number. */
function normalizeTransaction(row: Record<string, unknown>): Transaction {
  const t = row as unknown as Transaction;
  return {
    ...t,
    amount: Number(t.amount),
    available_balance: t.available_balance === null ? null : Number(t.available_balance),
  };
}
