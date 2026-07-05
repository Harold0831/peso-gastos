import type { ParsedBankEmail } from "./types";
import { htmlToText } from "./qik-parser";

/**
 * Parser de correos de Banco Caribe.
 *
 * Remitente: NOTIFICACIONES@bancocaribe.com.do. Basado en un correo real
 * de tarjeta de crédito (2026-07-05, compartido por un amigo de Harold):
 *
 *   Te informamos que tu Tarjeta de Crédito Caribe terminada 2050 posee
 *   una transacción en:
 *   Comercio: AMAZON RETAIL +14018657948 US
 *   Monto: 169.00
 *   Moneda: USD
 *   Fecha: 24 / 06 / 2026
 *   Hora: 12 : 25 : 56
 *   Saldo disponible: 28.87
 *
 * Particularidades: el monto viene SIN prefijo de moneda (la moneda es un
 * campo aparte — puede ser USD), y fecha/hora traen espacios alrededor de
 * los separadores. Solo tenemos confirmado el tipo "transacción de
 * tarjeta" (gasto) — si Caribe manda otros tipos (depósitos, reversos),
 * agregar el correo real como fixture antes de soportarlos.
 */

function extractInline(body: string, label: string): string | null {
  const match = body.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i"));
  return match ? match[1].trim() : null;
}

/** "24 / 06 / 2026" + "12 : 25 : 56" (24h) → Date UTC (AST = UTC-4). */
export function parseCaribeDateTime(dateRaw: string, timeRaw: string | null): Date | null {
  const dmy = dateRaw.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  if (!dmy) return null;
  const [, dd, mm, yyyy] = dmy;

  let hour = 12;
  let minute = 0;
  if (timeRaw) {
    const hms = timeRaw.match(/(\d{1,2})\s*:\s*(\d{2})/);
    if (hms) {
      hour = Number(hms[1]);
      minute = Number(hms[2]);
    }
  }

  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour + 4, minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseCaribeEmail(subject: string, rawBody: string): ParsedBankEmail | null {
  const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;

  // El asunto de Caribe es genérico ("BANCO CARIBE") — se detecta por el cuerpo
  if (!/posee una transacci[oó]n/i.test(body)) return null;

  const merchant = extractInline(body, "Comercio");
  const amountRaw = extractInline(body, "Monto");
  const currencyRaw = extractInline(body, "Moneda");
  const dateRaw = extractInline(body, "Fecha");
  const timeRaw = extractInline(body, "Hora");
  const balanceRaw = extractInline(body, "Saldo disponible");
  if (!merchant || !amountRaw || !dateRaw) return null;

  const amountMatch = amountRaw.match(/([\d,]+(?:\.\d{1,2})?)/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : NaN;
  const date = parseCaribeDateTime(dateRaw, timeRaw);
  if (!Number.isFinite(amount) || date === null) return null;

  const cardMatch = body.match(/terminada\s+(\d{4})/i);
  const balanceMatch = balanceRaw?.match(/([\d,]+(?:\.\d{1,2})?)/);

  return {
    type: "expense",
    merchant,
    amount,
    currency: currencyRaw && /usd|d[oó]lar/i.test(currencyRaw) ? "USD" : "DOP",
    date,
    card_last4: cardMatch ? cardMatch[1] : null,
    available_balance: balanceMatch ? Number(balanceMatch[1].replace(/,/g, "")) : null,
  };
}
