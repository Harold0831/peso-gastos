import type { ParsedQikEmail, TransactionType } from "./types";

/**
 * Parser de correos de notificación del banco Qik (ayuda@qik.com.do).
 *
 * Formato esperado en el cuerpo (HTML o texto plano):
 *   Localidad: NOMBRE DEL COMERCIO
 *   Fecha y hora: 05-06-2026 02:32 PM (AST)
 *   Monto: RD$ 2,840.50
 *   Balance Disponible: RD$ 48,210.35
 *
 * Los últimos 4 dígitos de la tarjeta pueden venir en el asunto o el cuerpo
 * ("terminada en 4521", "**** 4521", "tarjeta 4521").
 */

/** Convierte HTML a texto plano conservando saltos de línea útiles para el regex. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** "RD$ 2,840.50" → 2840.5 */
export function parseAmount(raw: string): number | null {
  const match = raw.match(/RD\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * "05-06-2026 02:32 PM (AST)" → Date en UTC.
 * AST (hora de República Dominicana) es UTC-4 fijo, sin horario de verano.
 */
export function parseQikDate(raw: string): Date | null {
  const match = raw.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  const [, mm, dd, yyyy, hh, min, meridiem] = match;
  let hour = Number(hh) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour + 4, Number(min)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Determina si es gasto o ingreso a partir del asunto, reforzado con el cuerpo. */
export function detectType(subject: string, body: string): TransactionType {
  const s = subject.toLowerCase();
  if (/transferencia recibida|dep[oó]sito/.test(s)) return "income";
  if (/transacci[oó]n|compra|consumo|retiro|pago/.test(s)) return "expense";
  // Asunto ambiguo: busca señales en el cuerpo
  const b = body.toLowerCase();
  if (/transferencia recibida|has recibido|te envi[oó]|dep[oó]sito/.test(b)) return "income";
  return "expense";
}

export function extractCardLast4(subject: string, body: string): string | null {
  const text = `${subject}\n${body}`;
  const match =
    text.match(/terminada?\s+en\s+(\d{4})/i) ??
    text.match(/\*{2,4}\s*(\d{4})/) ??
    text.match(/tarjeta\s+(?:de\s+[a-zá-ú]+\s+)?(?:no\.?\s*)?(\d{4})\b/i);
  return match ? match[1] : null;
}

function extractField(text: string, label: string): string | null {
  // Acepta "Localidad: X", "Localidad X" o el valor en la línea siguiente
  const pattern = new RegExp(`${label}\\s*:?\\s*(.+)`, "i");
  const match = text.match(pattern);
  if (match && match[1].trim()) return match[1].trim();
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => new RegExp(`^\\s*${label}\\s*:?\\s*$`, "i").test(l));
  if (idx >= 0 && idx + 1 < lines.length) return lines[idx + 1].trim();
  return null;
}

/**
 * Parsea un correo de Qik. Devuelve null si faltan los campos mínimos
 * (comercio, monto y fecha) — el sync lo reporta como error sin insertar.
 */
export function parseQikEmail(subject: string, rawBody: string): ParsedQikEmail | null {
  const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;

  const merchantRaw = extractField(body, "Localidad");
  const dateRaw = extractField(body, "Fecha y hora");
  const amountRaw = extractField(body, "Monto");
  const balanceRaw = extractField(body, "Balance Disponible");

  if (!merchantRaw || !dateRaw || !amountRaw) return null;

  const amount = parseAmount(amountRaw);
  const date = parseQikDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: detectType(subject, body),
    merchant: merchantRaw.replace(/\s+/g, " ").trim(),
    amount,
    currency: "DOP",
    date,
    card_last4: extractCardLast4(subject, body),
    available_balance: balanceRaw ? parseAmount(balanceRaw) : null,
  };
}
