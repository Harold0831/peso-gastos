import "server-only";
import { cache } from "react";
import { endOfMonth, startOfMonth } from "date-fns";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { getHomeCurrencyForUser, requireUserId } from "./users";
import { getLatestCachedRate } from "./exchange-rate";
import {
  MOCK_BUDGETS,
  MOCK_CARDS,
  MOCK_CATEGORIES,
  MOCK_GOALS,
  MOCK_RECURRING,
  MOCK_TRANSACTIONS,
} from "./mock-data";
import type {
  Budget,
  Card,
  CardWithSpend,
  Category,
  Currency,
  RecurringExpense,
  RecurringStatusItem,
  SavingsGoal,
  Transaction,
  UnregisteredCard,
} from "./types";

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

/**
 * Tope de la cola de "Por confirmar". En la práctica son pocas (el usuario
 * las confirma y dejan de estar pendientes), pero alguien que nunca confirme
 * podría acumular miles y no tiene sentido mandarlas todas al navegador para
 * una pantalla desde la que se confirman de a puñados.
 */
export const PENDING_LIMIT = 300;

/**
 * Todas las transacciones sin confirmar, sin acotar al mes.
 *
 * La vista "Por confirmar" es global a propósito: una pendiente vieja no debe
 * esconderse por cambiar de mes. Por eso necesita su propia consulta en vez
 * de reusar la del mes visible.
 */
export async function getPendingTransactions(): Promise<Transaction[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_TRANSACTIONS.filter((t) => !t.confirmed && !t.deleted_at)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, PENDING_LIMIT);
  }

  const { data, error } = await getSupabaseAdmin()
    .from("transactions")
    .select("*")
    .eq("user_id", await requireUserId())
    .eq("confirmed", false)
    .is("deleted_at", null)
    .order("date", { ascending: false })
    .limit(PENDING_LIMIT);
  if (error) throw new Error(`Error cargando pendientes: ${error.message}`);
  return (data ?? []).map(normalizeTransaction);
}

/**
 * Cuántas pendientes hay y cuándo entró la más reciente — lo único que la
 * campanita necesita saber de ellas.
 *
 * Existe para que `getAttentionItems()` no tenga que cargar el historial
 * entero solo para filtrar las no confirmadas (era el mismo desperdicio que
 * tenía /transactions). `newestCreatedAt` es lo que decide si un aviso
 * descartado vuelve a aparecer, así que se ordena por `created_at` y no por
 * `date`: una transacción con fecha vieja puede haber entrado hoy.
 */
export async function getPendingSummary(): Promise<{
  count: number;
  newestCreatedAt: string | null;
}> {
  if (!isSupabaseConfigured()) {
    const pending = MOCK_TRANSACTIONS.filter((t) => !t.confirmed && !t.deleted_at);
    const newest = pending.reduce<string | null>(
      (max, t) => (max === null || t.created_at > max ? t.created_at : max),
      null,
    );
    return { count: pending.length, newestCreatedAt: newest };
  }

  const userId = await requireUserId();
  const supabase = getSupabaseAdmin();
  const [countResult, newestResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("confirmed", false)
      .is("deleted_at", null),
    supabase
      .from("transactions")
      .select("created_at")
      .eq("user_id", userId)
      .eq("confirmed", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countResult.error) {
    throw new Error(`Error contando pendientes: ${countResult.error.message}`);
  }
  if (newestResult.error) {
    throw new Error(`Error cargando pendientes: ${newestResult.error.message}`);
  }
  return {
    count: countResult.count ?? 0,
    newestCreatedAt: newestResult.data?.created_at ?? null,
  };
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

/**
 * Saldo disponible que persiste entre meses (el número grande del dashboard).
 * Es `opening_balance` (el saldo real que el usuario fijó con "Ajustar saldo")
 * más ingresos − gastos de las transacciones posteriores a esa fecha. Sin
 * fijar nada, `opening_balance` es 0 y `as_of` null → sale el acumulado de
 * TODO lo registrado, que ya no se reinicia cada mes.
 */
export async function getAvailableBalance(): Promise<number> {
  const home = await getHomeCurrency();
  if (!isSupabaseConfigured()) {
    const rows = MOCK_TRANSACTIONS.filter((t) => !t.deleted_at);
    const toHome = await homeConverter(rows, home);
    return rows.reduce((s, t) => s + (t.type === "income" ? toHome(t) : -toHome(t)), 0);
  }

  const userId = await requireUserId();
  const { data: user } = await getSupabaseAdmin()
    .from("users")
    .select("opening_balance, opening_balance_as_of")
    .eq("id", userId)
    .maybeSingle();
  const opening = Number(user?.opening_balance ?? 0);
  const asOf = (user?.opening_balance_as_of as string | null) ?? null;

  let query = getSupabaseAdmin()
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null);
  // Solo cuentan las transacciones posteriores al saldo fijado (las anteriores
  // ya están "dentro" de ese número); sin as_of, cuentan todas.
  if (asOf) query = query.gt("date", asOf);
  const { data, error } = await query;
  if (error) throw new Error(`Error calculando balance: ${error.message}`);

  const rows = (data ?? []).map(normalizeTransaction);
  const toHome = await homeConverter(rows, home);
  return rows.reduce((s, t) => s + (t.type === "income" ? toHome(t) : -toHome(t)), opening);
}

/**
 * Categorías visibles para el usuario en sesión: las globales (seed,
 * user_id null) más las que él mismo creó. Es la lista que alimenta el
 * alta manual, el detalle, los presupuestos, las gráficas y la sugerencia
 * de Gemini — todo ya consume esta función, así que las personalizadas
 * aparecen en todos lados sin más cambios.
 */
export async function getAllCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return MOCK_CATEGORIES;
  const userId = await requireUserId();
  const { data, error } = await getSupabaseAdmin()
    .from("categories")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("name");
  if (error) throw new Error(`Error cargando categorías: ${error.message}`);
  return data ?? [];
}

/**
 * Ids de las categorías que este usuario ocultó (migración 0011). Cacheado
 * por request: varias vistas piden categorías en la misma página.
 */
export const getHiddenCategoryIds = cache(async (): Promise<string[]> => {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("hidden_categories")
    .select("category_id")
    .eq("user_id", await requireUserId());
  if (error) throw new Error(`Error cargando categorías ocultas: ${error.message}`);
  return (data ?? []).map((r) => r.category_id as string);
});

/**
 * Las categorías que se OFRECEN al elegir (alta manual, detalle,
 * presupuestos, gastos fijos, sugerencia de Gemini): todas menos las que el
 * usuario ocultó. Los reportes usan `getAllCategories()` a propósito, para
 * que el historial no pierda su ícono y color al ocultar una categoría.
 */
export async function getCategories(): Promise<Category[]> {
  const [all, hiddenIds] = await Promise.all([getAllCategories(), getHiddenCategoryIds()]);
  const hidden = new Set(hiddenIds);
  return all.filter((c) => !hidden.has(c.id));
}

export async function getBudgetsForMonth(month: Date): Promise<BudgetWithSpend[]> {
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
  // Todas (incluidas ocultas): un presupuesto ya creado sobre una categoría
  // que luego se ocultó debe seguir mostrándose con su nombre y color.
  const [categories, transactions] = await Promise.all([
    getAllCategories(),
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
  // Todas (incluidas ocultas): ocultar una categoría no debe hacer que los
  // gastos que ya tenía pierdan su ícono y color en las gráficas.
  const [categories, transactions] = await Promise.all([
    getAllCategories(),
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
    user_id: null,
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

function monthKeyOf(month: Date): string {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
}

function normalizeRecurring(row: Record<string, unknown>): RecurringExpense {
  return {
    id: row.id as string,
    name: row.name as string,
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    currency: (row.currency as Currency) ?? "DOP",
    category: (row.category as string | null) ?? null,
    due_day: row.due_day === null || row.due_day === undefined ? null : Number(row.due_day),
    active: Boolean(row.active),
    created_at: row.created_at as string,
  };
}

/** Gastos fijos activos del usuario, ordenados por día de pago. */
export async function getRecurringExpenses(): Promise<RecurringExpense[]> {
  if (!isSupabaseConfigured()) return MOCK_RECURRING;
  const { data, error } = await getSupabaseAdmin()
    .from("recurring_expenses")
    .select("*")
    .eq("user_id", await requireUserId())
    .eq("active", true)
    .order("due_day", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Error cargando gastos fijos: ${error.message}`);
  return (data ?? []).map(normalizeRecurring);
}

/** ¿Una transacción del mes cuadra con este gasto fijo? Match por nombre
 *  (el nombre del gasto fijo aparece en el comercio, sin distinguir
 *  mayúsculas) — suficiente para "Netflix", "Claro", "EDEESTE", etc. */
function matchesRecurring(expense: RecurringExpense, merchant: string): boolean {
  const name = expense.name.trim().toLowerCase();
  if (name.length < 3) return false;
  return merchant.toLowerCase().includes(name);
}

/**
 * Gastos fijos resueltos para un mes: pagado o pendiente. El estado sale de
 * (1) un override manual en recurring_payments si existe, o si no (2)
 * auto-detección: hay una transacción de gasto este mes cuyo comercio cuadra
 * con el nombre del gasto fijo. Pensado para el dashboard y la pantalla
 * /recurring.
 */
export async function getRecurringForMonth(month: Date): Promise<RecurringStatusItem[]> {
  const expenses = await getRecurringExpenses();
  if (expenses.length === 0) return [];

  const monthTx = (await getTransactions({ month })).filter(
    (t) => t.type === "expense" && t.confirmed,
  );

  const overrides = new Map<string, "paid" | "pending">();
  if (isSupabaseConfigured()) {
    const { data } = await getSupabaseAdmin()
      .from("recurring_payments")
      .select("recurring_id, status")
      .eq("user_id", await requireUserId())
      .eq("month", monthKeyOf(month));
    for (const row of data ?? []) {
      overrides.set(row.recurring_id as string, row.status as "paid" | "pending");
    }
  }

  return expenses.map((expense) => {
    const override = overrides.get(expense.id);
    if (override) {
      return { expense, status: override, auto: false, matchedMerchant: null };
    }
    const match = monthTx.find((t) => matchesRecurring(expense, t.merchant));
    return match
      ? { expense, status: "paid" as const, auto: true, matchedMerchant: match.merchant }
      : { expense, status: "pending" as const, auto: false, matchedMerchant: null };
  });
}

/** Tarjetas registradas del usuario. Vacío = la función está "apagada":
 *  ningún filtro ni selector de tarjeta aparece en el resto de la app. */
export async function getCards(): Promise<Card[]> {
  if (!isSupabaseConfigured()) return MOCK_CARDS;
  const { data, error } = await getSupabaseAdmin()
    .from("cards")
    .select("*")
    .eq("user_id", await requireUserId())
    .order("created_at");
  if (error) throw new Error(`Error cargando tarjetas: ${error.message}`);
  return data ?? [];
}

/**
 * Tarjetas con su gasto del mes en moneda de casa. El vínculo con las
 * transacciones es por `card_last4`, que los parsers ya guardaban desde
 * siempre — por eso el desglose funciona sobre todo el historial sin
 * backfill ni esperar movimientos nuevos.
 */
export async function getCardsForMonth(month: Date): Promise<CardWithSpend[]> {
  const [cards, transactions] = await Promise.all([getCards(), getTransactions({ month })]);
  if (cards.length === 0) return [];

  const toHome = await homeConverter(transactions, await getHomeCurrency());
  const expenses = transactions.filter((t) => t.type === "expense");

  return cards.map((card) => {
    const rows = expenses.filter((t) => t.card_last4 === card.last4);
    return {
      card,
      spent: rows.reduce((sum, t) => sum + toHome(t), 0),
      count: rows.length,
    };
  });
}

/**
 * Últimos 4 dígitos que aparecen en las transacciones del usuario pero que
 * todavía no tienen tarjeta registrada, con cuántos movimientos tiene cada
 * uno. Alimenta el auto-descubrimiento: en vez de pedirle al usuario que
 * teclee sus tarjetas, Peso le propone las que ya detectó en su historial.
 */
export async function getUnregisteredCards(): Promise<UnregisteredCard[]> {
  const cards = await getCards();
  const known = new Set(cards.map((c) => c.last4));

  let rows: { card_last4: string | null }[];
  if (!isSupabaseConfigured()) {
    rows = MOCK_TRANSACTIONS.filter((t) => !t.deleted_at).map((t) => ({
      card_last4: t.card_last4,
    }));
  } else {
    const { data, error } = await getSupabaseAdmin()
      .from("transactions")
      .select("card_last4")
      .eq("user_id", await requireUserId())
      .is("deleted_at", null)
      .not("card_last4", "is", null);
    if (error) throw new Error(`Error detectando tarjetas: ${error.message}`);
    rows = data ?? [];
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    const last4 = row.card_last4;
    if (!last4 || known.has(last4)) continue;
    counts.set(last4, (counts.get(last4) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([last4, count]) => ({ last4, count }))
    .sort((a, b) => b.count - a.count);
}

export interface AttentionItem {
  id: string;
  icon: string;
  title: string;
  detail: string;
  href: string;
  kind: "gmail" | "budget" | "pending";
  /** Los avisos descartables llevan ✕; los críticos (Gmail roto) no. */
  dismissible: boolean;
  /** Estado guardado al descartar — permite reaparecer con info nueva. */
  context?: string;
}

/**
 * Bandeja de notificaciones in-app (la campanita del dashboard). Se DERIVA
 * del estado actual en vez de persistirse: nunca muestra avisos viejos ya
 * resueltos. "Descartar" (notification_dismissals, migración 0007) esconde
 * un aviso, pero reaparece si hay información NUEVA: el resumen de
 * pendientes guarda el created_at de la más reciente al descartar y
 * vuelve cuando llega una posterior; los avisos de presupuesto llevan el
 * mes y el nivel (80%/excedido) en su id — al escalar o cambiar de mes,
 * son un aviso nuevo. Orden: Gmail roto → pendientes → presupuestos.
 */
export async function getAttentionItems(): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Import diferido: users.ts es server-only y depende de la sesión
  const { formatMoney } = await import("./format");

  const dismissals = new Map<string, string | null>();
  if (isSupabaseConfigured()) {
    const userId = await requireUserId();
    const [{ getGmailStatus }, { data: rows }] = await Promise.all([
      import("./users"),
      getSupabaseAdmin()
        .from("notification_dismissals")
        .select("item_id, context")
        .eq("user_id", userId),
    ]);
    for (const r of rows ?? []) dismissals.set(r.item_id, r.context);

    const gmail = await getGmailStatus(userId);
    if (gmail.linked && !gmail.syncEnabled) {
      items.push({
        id: "gmail-expired",
        icon: "✉️",
        title: "El acceso a tu Gmail expiró",
        detail: "Reconéctalo para que tus transacciones sigan llegando",
        href: "/profile",
        kind: "gmail",
        dismissible: false, // rotura real: no se puede ignorar
      });
    }
  }

  const [budgets, pending, home] = await Promise.all([
    getBudgetsForMonth(now),
    getPendingSummary(),
    getHomeCurrency(),
  ]);

  // Pendientes agrupadas en UN aviso — revisar la lista es una sola acción.
  if (pending.count > 0 && pending.newestCreatedAt !== null) {
    const newest = pending.newestCreatedAt;
    const dismissedAt = dismissals.get("pending");
    // Reaparece solo si hay una pendiente MÁS NUEVA que la del descarte
    if (dismissedAt === undefined || (dismissedAt !== null && newest > dismissedAt)) {
      items.push({
        id: "pending",
        icon: "⏳",
        title:
          pending.count === 1
            ? "Tienes 1 transacción sin confirmar"
            : `Tienes ${pending.count} transacciones sin confirmar`,
        detail: "Toca para revisarlas y categorizarlas",
        href: "/transactions?filter=pendientes",
        kind: "pending",
        dismissible: true,
        context: newest,
      });
    }
  }

  for (const { budget, category, spent } of budgets) {
    const pct = budget.limit_amount > 0 ? spent / budget.limit_amount : 0;
    const level = pct >= 1 ? "over" : pct >= 0.8 ? "warn" : null;
    if (!level) continue;
    const id = `budget-${level}-${category.id}-${monthKey}`;
    if (dismissals.has(id)) continue;
    items.push({
      id,
      icon: level === "over" ? "🚨" : "⚠️",
      title:
        level === "over"
          ? `Presupuesto de ${category.name} excedido`
          : `Presupuesto de ${category.name} al ${Math.round(pct * 100)}%`,
      detail: `${formatMoney(spent, home)} de ${formatMoney(budget.limit_amount, home)}`,
      href: "/budget",
      kind: "budget",
      dismissible: true,
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
