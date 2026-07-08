export type TransactionType = "expense" | "income";

/** Monedas que los parsers de banco producen hoy. `amount` siempre se
 *  guarda en su moneda original; la conversión a DOP para reportes usa
 *  `exchange_rate` (ver exchange-rate.ts). */
export type Currency = "DOP" | "USD";

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
