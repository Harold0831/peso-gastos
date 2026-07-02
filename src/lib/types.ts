export type TransactionType = "expense" | "income";

export interface Transaction {
  id: string;
  gmail_message_id: string | null;
  type: TransactionType;
  merchant: string;
  amount: number;
  currency: string;
  date: string; // ISO timestamptz
  card_last4: string | null;
  available_balance: number | null;
  category: string | null;
  ai_suggested_category: string | null;
  confirmed: boolean;
  notes: string | null;
  created_at: string;
  raw_email_snippet: string | null;
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

/** Resultado del parser de correos Qik, previo a insertar en la base de datos. */
export interface ParsedQikEmail {
  type: TransactionType;
  merchant: string;
  amount: number;
  currency: string;
  date: Date;
  card_last4: string | null;
  available_balance: number | null;
}
