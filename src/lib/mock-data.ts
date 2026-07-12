import type { Budget, Category, SavingsGoal, Transaction } from "./types";

/**
 * Datos de ejemplo para desarrollo local sin Supabase configurado.
 * Las fechas se generan relativas a hoy para que "Hoy"/"Ayer" y el mes
 * actual siempre tengan datos.
 */

function daysAgo(days: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const MOCK_CATEGORIES: Category[] = [
  { id: "c1", name: "Alimentación", icon: "🛒", color: "#2563EB", is_default: true },
  { id: "c2", name: "Transporte", icon: "🚗", color: "#6B7280", is_default: true },
  { id: "c3", name: "Salud", icon: "💊", color: "#16A34A", is_default: true },
  { id: "c4", name: "Entretenimiento", icon: "🎬", color: "#8B7355", is_default: true },
  { id: "c5", name: "Servicios/Facturas", icon: "📄", color: "#94A3B8", is_default: true },
  { id: "c6", name: "Compras", icon: "🛍️", color: "#475569", is_default: true },
  { id: "c7", name: "Transferencias", icon: "🔁", color: "#64748B", is_default: true },
  { id: "c8", name: "Educación", icon: "📚", color: "#7C6FBF", is_default: true },
  { id: "c9", name: "Otros", icon: "📌", color: "#9CA3AF", is_default: true },
];

const tx = (
  id: string,
  overrides: Partial<Transaction> & Pick<Transaction, "merchant" | "amount" | "date" | "type">,
): Transaction => ({
  id,
  gmail_message_id: `mock-${id}`,
  currency: "DOP",
  exchange_rate: null,
  card_last4: "4521",
  available_balance: null,
  category: null,
  ai_suggested_category: null,
  confirmed: true,
  notes: null,
  source: null,
  created_at: overrides.date,
  raw_email_snippet: null,
  deleted_at: null,
  ...overrides,
});

export const MOCK_TRANSACTIONS: Transaction[] = [
  tx("t1", {
    merchant: "Supermercado Nacional",
    amount: 2840.5,
    type: "expense",
    date: daysAgo(0, 14, 32),
    category: "Alimentación",
  }),
  tx("t2", {
    merchant: "Uber",
    amount: 385,
    type: "expense",
    date: daysAgo(0, 11, 15),
    confirmed: false,
    ai_suggested_category: "Transporte",
    available_balance: 48210.35,
  }),
  tx("t3", {
    merchant: "Café Santo Domingo",
    amount: 245,
    type: "expense",
    date: daysAgo(0, 9, 48),
    category: "Alimentación",
  }),
  tx("t4", {
    merchant: "Banco Popular",
    amount: 65000,
    type: "income",
    date: daysAgo(0, 8, 0),
    category: "Transferencias",
    card_last4: null,
  }),
  tx("t5", {
    merchant: "Claro",
    amount: 1450,
    type: "expense",
    date: daysAgo(1, 19, 22),
    category: "Servicios/Facturas",
  }),
  tx("t6", {
    merchant: "Farmacia Carol",
    amount: 680.3,
    type: "expense",
    date: daysAgo(1, 16, 5),
    category: "Salud",
  }),
  tx("t7", {
    merchant: "Amazon",
    amount: 3200,
    type: "expense",
    date: daysAgo(1, 12, 40),
    confirmed: false,
    ai_suggested_category: "Compras",
    available_balance: 51595.85,
  }),
  tx("t8", {
    merchant: "Plaza Lama",
    amount: 890.75,
    type: "expense",
    date: daysAgo(2, 10, 18),
    category: "Compras",
  }),
  // Compra en dólares (p. ej. tarjeta de crédito Caribe): muestra el
  // badge US$ y la conversión a RD$ en el detalle.
  tx("t13", {
    merchant: "Spotify",
    amount: 11.99,
    type: "expense",
    date: daysAgo(2, 15, 30),
    category: "Entretenimiento",
    currency: "USD",
    exchange_rate: 61.25,
  }),
  tx("t9", {
    merchant: "Netflix",
    amount: 649,
    type: "expense",
    date: daysAgo(4, 3, 12),
    category: "Entretenimiento",
  }),
  tx("t10", {
    merchant: "Caribe Tours",
    amount: 550,
    type: "expense",
    date: daysAgo(6, 7, 45),
    category: "Transporte",
  }),
  tx("t11", {
    merchant: "Cabify",
    amount: 420,
    type: "expense",
    date: daysAgo(0, 8, 20),
    confirmed: false,
    ai_suggested_category: "Transporte",
    available_balance: 47790.35,
  }),
  tx("t12", {
    merchant: "PedidosYa*Wendys",
    amount: 780,
    type: "expense",
    date: daysAgo(1, 20, 5),
    confirmed: false,
    ai_suggested_category: "Alimentación",
    available_balance: 51100.85,
  }),
];

const monthStart = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
})();

export const MOCK_BUDGETS: Budget[] = [
  { id: "b1", category_id: "c1", month: monthStart, limit_amount: 12000, created_at: monthStart },
  { id: "b2", category_id: "c2", month: monthStart, limit_amount: 3500, created_at: monthStart },
  { id: "b3", category_id: "c5", month: monthStart, limit_amount: 4000, created_at: monthStart },
  { id: "b4", category_id: "c6", month: monthStart, limit_amount: 6000, created_at: monthStart },
  { id: "b5", category_id: "c3", month: monthStart, limit_amount: 3000, created_at: monthStart },
];

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const MOCK_GOALS: SavingsGoal[] = [
  {
    id: "g1",
    name: "Fondo de emergencia",
    target_amount: 100000,
    current_amount: 62500,
    deadline: daysFromNow(120),
    icon: "🛟",
    color: "#2563EB",
    created_at: daysAgo(60, 0, 0),
  },
  {
    id: "g2",
    name: "iPhone nuevo",
    target_amount: 75000,
    current_amount: 75000,
    deadline: daysFromNow(30),
    icon: "📱",
    color: "#16A34A",
    created_at: daysAgo(90, 0, 0),
  },
  {
    id: "g3",
    name: "Viaje a Punta Cana",
    target_amount: 40000,
    current_amount: 12000,
    deadline: daysFromNow(200),
    icon: "🏝️",
    color: "#D97706",
    created_at: daysAgo(20, 0, 0),
  },
];
