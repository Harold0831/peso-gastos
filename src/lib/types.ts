export type TransactionType = "expense" | "income";

/** De dónde salió la transacción: parsing de correos, alta manual en la
 *  web, o captura por voz (Shortcut de iOS). NULL en filas pre-migración 0005. */
export type TransactionSource = "email" | "manual" | "voice";

/** Monedas soportadas. `amount` siempre se guarda en su moneda original;
 *  la conversión a la moneda de casa del usuario para reportes usa
 *  `exchange_rate` (ver exchange-rate.ts). DOP/USD vienen del parsing de
 *  correos; EUR de la captura por voz (Shortcut de iOS). */
export type Currency = "DOP" | "USD" | "EUR";

export interface Transaction {
  id: string;
  gmail_message_id: string | null;
  type: TransactionType;
  merchant: string;
  amount: number;
  currency: Currency;
  /** Pesos por 1 unidad de `currency`, capturada al sincronizar/crear.
   *  NULL en transacciones DOP y en las históricas previas a la migración
   *  0004 (la capa de lectura usa la última tasa cacheada como fallback). */
  exchange_rate: number | null;
  date: string; // ISO timestamptz
  card_last4: string | null;
  available_balance: number | null;
  category: string | null;
  ai_suggested_category: string | null;
  confirmed: boolean;
  notes: string | null;
  source: TransactionSource | null;
  created_at: string;
  raw_email_snippet: string | null;
  /** Soft delete: no null → oculta de la UI, pero sigue en la tabla para
   *  que el sync no vuelva a insertar el mismo correo. */
  deleted_at: string | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
  /** Dueño de la categoría. NULL = categoría global (seed), visible para
   *  todos; con user_id = personalizada, solo la ve y la puede borrar ese
   *  usuario. Ver migración 0008. */
  user_id: string | null;
}

export interface Budget {
  id: string;
  category_id: string;
  month: string; // primer día del mes, "2026-05-01"
  limit_amount: number;
  created_at: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  icon: string;
  color: string;
  created_at: string;
}

/** Débito o crédito. Solo informativo: no cambia cómo se calculan el saldo
 *  ni los presupuestos (ver migración 0012). */
export type CardType = "debit" | "credit";

/** Tarjeta del usuario. Se vincula a las transacciones por `last4`, que los
 *  parsers de correos ya guardaban desde el inicio en `card_last4`. */
export interface Card {
  id: string;
  last4: string;
  nickname: string;
  type: CardType;
  color: string;
  created_at: string;
}

/** Tarjeta con su gasto del mes, en la moneda de casa (pantalla /cards). */
export interface CardWithSpend {
  card: Card;
  spent: number;
  count: number;
}

/** Últimos 4 vistos en las transacciones que todavía no tienen tarjeta
 *  registrada — la base del auto-descubrimiento en /cards. */
export interface UnregisteredCard {
  last4: string;
  count: number;
}

/** Gasto fijo / pago recurrente (alquiler, Netflix, la luz…). Ver migración
 *  0010. Distinto de un presupuesto: es un pago concreto que se repite, no un
 *  techo por categoría. */
export interface RecurringExpense {
  id: string;
  name: string;
  amount: number | null;
  currency: Currency;
  category: string | null;
  /** Día del mes en que se paga (1-31), opcional. */
  due_day: number | null;
  active: boolean;
  created_at: string;
}

/** Un gasto fijo resuelto para un mes concreto: si está pagado y de dónde
 *  salió ese estado (auto-detectado de una transacción, o marcado a mano). */
export interface RecurringStatusItem {
  expense: RecurringExpense;
  status: "paid" | "pending";
  /** true si el "pagado" salió de auto-detectar una transacción del mes. */
  auto: boolean;
  /** Comercio de la transacción que disparó el auto-match (para mostrarlo). */
  matchedMerchant: string | null;
}

/** Resultado de un parser de correo bancario, previo a insertar en la DB. */
export interface ParsedBankEmail {
  type: TransactionType;
  merchant: string;
  amount: number;
  currency: Currency;
  date: Date;
  card_last4: string | null;
  available_balance: number | null;
}

/** @deprecated usa ParsedBankEmail — alias del tipo original de Qik. */
export type ParsedQikEmail = ParsedBankEmail;
