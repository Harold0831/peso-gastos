import type { Currency, ParsedBankEmail } from "./types";
import { htmlToText } from "./qik-parser";

/**
 * Parser de correos de Scotiabank RD.
 *
 * Remitente: alertas@scotiabank.com. Tipos confirmados contra correos
 * reales (2026-07-05, compartidos por un amigo de Harold):
 *
 *   1. "Pago al Instante realizado"    → gasto (transferencia interbancaria)
 *   2. "Pago de factura realizado"     → gasto
 *   3. "Retiro de cajero automático"   → gasto
 *   4. "Compra fuera del país"         → gasto (compra con tarjeta)
 *   5. "Transferencias a terceros"     → gasto
 *
 * Todos son prosa (sin tabla). PARTICULARIDAD CLAVE: el cuerpo trae la
 * hora ("a las 07:19 am AST") pero NO la fecha — la fecha se toma de
 * `receivedAt` (cuándo llegó el correo, que es segundos después de la
 * transacción). Montos como "$1,757.49" o "$18,000.00 DOP".
 *
 * Solo se soportan estos 5 tipos; otros asuntos de Scotiabank (alertas de
 * login, etc.) se ignoran en silencio hasta catalogar correos reales.
 */

function parseScotiaAmount(raw: string): number | null {
  const match = raw.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Combina la fecha del correo (receivedAt) con la hora del cuerpo
 * ("a las 07:19 am AST"). Sin hora en el cuerpo, usa receivedAt tal cual.
 */
function buildDate(body: string, receivedAt: Date): Date {
  const time = body.match(/a las\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!time) return receivedAt;

  let hour = Number(time[1]) % 12;
  if (time[3].toLowerCase() === "pm") hour += 12;

  // receivedAt está en UTC; la hora del cuerpo es AST (UTC-4). Tomamos el
  // día calendario de receivedAt EN AST para no cruzar de día a medianoche.
  const astMs = receivedAt.getTime() - 4 * 3600_000;
  const ast = new Date(astMs);
  return new Date(
    Date.UTC(ast.getUTCFullYear(), ast.getUTCMonth(), ast.getUTCDate(), hour + 4, Number(time[2])),
  );
}

function currencyOf(body: string): Currency {
  return /\$[\d,.]+\s*USD/i.test(body) ? "USD" : "DOP";
}

export function parseScotiabankEmail(
  subject: string,
  rawBody: string,
  receivedAt: Date,
): ParsedBankEmail | null {
  const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;
  const s = subject.toLowerCase();

  const base = {
    type: "expense" as const,
    currency: currencyOf(body),
    date: buildDate(body, receivedAt),
    card_last4: null,
    available_balance: null,
  };

  if (s.includes("pago al instante realizado")) {
    const amount = parseScotiaAmount(body.match(/Monto:\s*([^\n]+)/i)?.[1] ?? "");
    if (amount === null) return null;
    const bank = body.match(/Banco:\s*([^\n•]+)/i)?.[1]?.trim();
    return { ...base, merchant: bank ? `Pago al Instante · ${bank}` : "Pago al Instante", amount };
  }

  if (s.includes("pago de factura realizado")) {
    const match = body.match(
      /pago de factura por una cantidad de\s+(\$[\d,.]+)\s+a\s+(.+?)\s+desde la cuenta/i,
    );
    if (!match) return null;
    const amount = parseScotiaAmount(match[1]);
    if (amount === null) return null;
    return { ...base, merchant: match[2].trim(), amount };
  }

  if (s.includes("retiro de cajero")) {
    const amount = parseScotiaAmount(body.match(/por un monto de\s+(\$[\d,.]+)/i)?.[1] ?? "");
    if (amount === null) return null;
    return { ...base, merchant: "Retiro en cajero", amount };
  }

  if (s.includes("compra fuera del país") || s.includes("compra fuera del pais")) {
    const match = body.match(/por un monto de\s+(\$[\d,.]+)\s+en\s+(.+?)\s+con su tarjeta/i);
    if (!match) return null;
    const amount = parseScotiaAmount(match[1]);
    if (amount === null) return null;
    return { ...base, merchant: match[2].trim(), amount };
  }

  if (s.includes("transferencias a terceros")) {
    const amount = parseScotiaAmount(
      body.match(/transferencia por una cantidad de\s+(\$[\d,.]+)/i)?.[1] ?? "",
    );
    if (amount === null) return null;
    return { ...base, merchant: "Transferencia a terceros", amount };
  }

  return null;
}
