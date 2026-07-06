import type { ParsedBankEmail } from "./types";
import { htmlToText } from "./qik-parser";
import { zipColumns } from "./popular-parser";

/**
 * Parser de correos del Banco BHD.
 *
 * Remitentes: Alertas@bhd.com.do (transacciones) y notificaciones@bhd.com.do
 * (estados intermedios). Tipos confirmados contra correos reales
 * (2026-07-05, compartidos por un amigo de Harold):
 *
 *   1. "BHD Notificación de Transacciones" → gasto (compra con tarjeta).
 *      Tabla columnar: Fecha/Moneda/Monto/Comercio/Estado/Tipo, con la
 *      fecha en "04/07/2026 05:57 pm". Solo Estado "Aprobada".
 *   2. "Transacciones entre productos BHD y a otros Bancos" → gasto
 *      (transferencia enviada). Campos "Label:" con el valor en la línea
 *      siguiente; "Fecha y hora de la transacción: 04/07/2026 - 7:52 PM".
 *
 * "Notificación Pagos al Instante en Proceso" (notificaciones@) se IGNORA:
 * es un estado intermedio ("recibirá una actualización en 24h") y duplica
 * la misma transferencia que ya llega por el correo #2 — parsearlo
 * duplicaría el gasto. Otros correos de BHD (estados de cuenta de
 * servicios@, marketing de info@) ni siquiera entran al filtro de
 * remitentes.
 */

function parseBhdAmount(raw: string): number | null {
  const match = raw.match(/(?:RD)?\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** "04/07/2026 05:57 pm" o "04/07/2026 - 7:52 PM" → Date UTC (AST). */
export function parseBhdDate(raw: string): Date | null {
  const match = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*-?\s*(\d{1,2}):(\d{2})\s*(am|pm))?/i);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min, meridiem] = match;

  let hour = 12;
  let minute = 0;
  if (hh && min && meridiem) {
    hour = Number(hh) % 12;
    if (meridiem.toLowerCase() === "pm") hour += 12;
    minute = Number(min);
  }

  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour + 4, minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Label:" con el valor en la misma línea o en la siguiente. */
function extractField(body: string, label: string): string | null {
  const lines = body.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(new RegExp(`^${label}\\s*:\\s*(.*)$`, "i"));
    if (!match) continue;
    if (match[1].trim()) return match[1].trim();
    return lines[i + 1]?.trim() || null;
  }
  return null;
}

function buildCardTransaction(body: string): ParsedBankEmail | null {
  const cols = zipColumns(body, ["Fecha", "Moneda", "Monto", "Comercio", "Estado", "Tipo"]);
  if (!cols) return null;
  if (!/^aprobada$/i.test(cols.get("Estado") ?? "")) return null;

  const amount = parseBhdAmount(cols.get("Monto") ?? "");
  const date = parseBhdDate(cols.get("Fecha") ?? "");
  const merchant = cols.get("Comercio");
  if (amount === null || date === null || !merchant) return null;

  const cardMatch = body.match(/#\s*(\d{4})/);
  return {
    type: "expense",
    merchant,
    amount,
    currency: /usd|d[oó]lar/i.test(cols.get("Moneda") ?? "") ? "USD" : "DOP",
    date,
    card_last4: cardMatch ? cardMatch[1] : null,
    available_balance: null,
  };
}

function buildTransfer(body: string): ParsedBankEmail | null {
  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha y hora de la transacción");
  const beneficiary = extractField(body, "Beneficiario");
  if (!amountRaw || !dateRaw) return null;

  const amount = parseBhdAmount(amountRaw);
  const date = parseBhdDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "expense",
    merchant: beneficiary ?? "Transferencia BHD",
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

/** Estados intermedios que duplicarían la transacción final. */
export function isIgnorableBhdEmail(subject: string): boolean {
  return /pagos al instante en proceso/i.test(subject);
}

export function parseBhdEmail(subject: string, rawBody: string): ParsedBankEmail | null {
  const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;
  const s = subject.toLowerCase();

  if (
    s.includes("bhd notificación de transacciones") ||
    s.includes("bhd notificacion de transacciones")
  ) {
    return buildCardTransaction(body);
  }
  if (s.includes("transacciones entre productos bhd")) {
    return buildTransfer(body);
  }
  return null;
}
