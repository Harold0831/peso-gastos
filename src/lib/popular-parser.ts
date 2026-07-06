import type { ParsedBankEmail } from "./types";
import { htmlToText } from "./qik-parser";

/**
 * Parser de correos del Banco Popular Dominicano.
 *
 * Remitente transaccional: notificaciones@popularenlinea.com (el marketing
 * viene de popularteinforma@ y otros @bpd.com.do — quedan fuera del filtro
 * de remitentes). Tipos confirmados contra la bandeja real de Harold
 * (2026-07-05):
 *
 *   1. "Notificación de Consumo"        → gasto (compra con tarjeta)
 *   2. "Notificación de Retiro"         → gasto (retiro en cajero)
 *   3. "Notificación de retiro Código Cash" → gasto
 *   4. "Depósito por ATM"               → ingreso
 *   5. "Notificaciones Pagos al Instante transferencia enviada" → gasto
 *   6. "Notificacion Reverso a cuenta por sobregiro" → ingreso
 *
 * A diferencia de Qik (label: valor por línea), el Popular usa tablas
 * COLUMNARES: primero todas las etiquetas (Monto/Moneda/Fecha/Comercio/
 * Estatus) y después todos los valores en el mismo orden. zipColumns()
 * localiza la fila de etiquetas y empareja con las N líneas siguientes.
 *
 * Formatos de fecha (ninguno trae hora → mediodía AST):
 *   - "20/12/2025" o "2/1/2026" (D/M/YYYY)
 *   - "26/5/26" (D/M/YY, reverso por sobregiro)
 *   - "20260704" (YYYYMMDD, depósito por ATM)
 * Montos: "RD$1,500.00", "RD $4,000.00", "RD 12,400.00", "RD$ 24,988.00".
 */

/** "RD$1,500.00" / "RD 12,400.00" / "RD $4,000.00" → número. */
export function parsePopularAmount(raw: string): number | null {
  const match = raw.match(/RD\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Fechas del Popular (ver doc de arriba) → Date en UTC (mediodía AST). */
export function parsePopularDate(raw: string): Date | null {
  const compact = raw.trim();

  const yyyymmdd = compact.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const [, yyyy, mm, dd] = yyyymmdd;
    const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 12 + 4, 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmy = compact.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (dmy) {
    const [, dd, mm, yy] = dmy;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const date = new Date(Date.UTC(year, Number(mm) - 1, Number(dd), 12 + 4, 0));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/** "Peso dominicano" → DOP, "Dólar…" → USD. Default DOP. */
function parseCurrency(raw: string | null): string {
  if (raw && /d[oó]lar|usd/i.test(raw)) return "USD";
  return "DOP";
}

function extractCardLast4(body: string): string | null {
  const match = body.match(/terminada en\s+(\d{4})/i);
  return match ? match[1] : null;
}

/**
 * Tabla columnar: encuentra la línea donde empieza la secuencia de
 * etiquetas (cada línea TERMINA con la etiqueta — a veces la primera viene
 * pegada a la frase anterior, p. ej. "…detalle de la transacción: Monto")
 * y devuelve las N líneas siguientes como valores, en el mismo orden.
 * Exportada porque BHD usa el mismo patrón de tabla en sus correos.
 */
export function zipColumns(body: string, labels: string[]): Map<string, string> | null {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i + labels.length * 2 <= lines.length + 1; i++) {
    const matches = labels.every((label, k) =>
      lines[i + k]?.toLowerCase().endsWith(label.toLowerCase()),
    );
    if (!matches) continue;
    const values = lines.slice(i + labels.length, i + labels.length * 2);
    if (values.length < labels.length) return null;
    return new Map(labels.map((label, k) => [label, values[k]]));
  }
  return null;
}

/** Campo inline "Label: valor" en su propia línea (pagos al instante). */
function extractInline(body: string, label: string): string | null {
  const match = body.match(new RegExp(`${label}\\s*:\\s*(.+)`, "i"));
  return match ? match[1].trim() : null;
}

const APPROVED_RE = /^aprobada$/i;

function buildConsumo(body: string): ParsedBankEmail | null {
  const cols = zipColumns(body, ["Monto", "Moneda", "Fecha", "Comercio", "Estatus"]);
  if (!cols) return null;
  if (!APPROVED_RE.test(cols.get("Estatus") ?? "")) return null;

  const amount = parsePopularAmount(cols.get("Monto") ?? "");
  const date = parsePopularDate(cols.get("Fecha") ?? "");
  const merchant = cols.get("Comercio");
  if (amount === null || date === null || !merchant) return null;

  return {
    type: "expense",
    merchant,
    amount,
    currency: parseCurrency(cols.get("Moneda") ?? null),
    date,
    card_last4: extractCardLast4(body),
    available_balance: null,
  };
}

function buildRetiro(body: string): ParsedBankEmail | null {
  const cols = zipColumns(body, ["Monto", "Moneda", "Fecha", "Cajero Automatico", "Estatus"]);
  if (!cols) return null;
  if (!APPROVED_RE.test(cols.get("Estatus") ?? "")) return null;

  const amount = parsePopularAmount(cols.get("Monto") ?? "");
  const date = parsePopularDate(cols.get("Fecha") ?? "");
  if (amount === null || date === null) return null;

  const atm = cols.get("Cajero Automatico");
  return {
    type: "expense",
    merchant: atm ? `Retiro cajero ${atm}` : "Retiro en cajero",
    amount,
    currency: parseCurrency(cols.get("Moneda") ?? null),
    date,
    card_last4: extractCardLast4(body),
    available_balance: null,
  };
}

function buildRetiroCodigoCash(body: string): ParsedBankEmail | null {
  const cols = zipColumns(body, ["Monto", "Fecha", "Estatus"]);
  if (!cols) return null;
  if (!APPROVED_RE.test(cols.get("Estatus") ?? "")) return null;

  const amount = parsePopularAmount(cols.get("Monto") ?? "");
  const date = parsePopularDate(cols.get("Fecha") ?? "");
  if (amount === null || date === null) return null;

  return {
    type: "expense",
    merchant: "Retiro Código Cash",
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

function buildDeposito(body: string): ParsedBankEmail | null {
  const cols = zipColumns(body, ["Monto", "Fecha", "Canal"]);
  if (!cols) return null;

  const amount = parsePopularAmount(cols.get("Monto") ?? "");
  const date = parsePopularDate(cols.get("Fecha") ?? "");
  if (amount === null || date === null) return null;

  const canal = cols.get("Canal");
  return {
    type: "income",
    merchant: canal ? `Depósito ${canal}` : "Depósito por ATM",
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

function buildPagoInstante(body: string): ParsedBankEmail | null {
  const beneficiary = extractInline(body, "Beneficiario");
  const amountRaw = extractInline(body, "Monto");
  const dateRaw = extractInline(body, "Fecha");
  if (!beneficiary || !amountRaw || !dateRaw) return null;

  const amount = parsePopularAmount(amountRaw);
  const date = parsePopularDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "expense",
    merchant: beneficiary,
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

function buildReversoSobregiro(body: string): ParsedBankEmail | null {
  // Prosa: "…devolución de RD 2.32 correspondiente al cargo por sobregiro
  // aplicado a su cuenta No 7379 en fecha 26/5/26."
  const match = body.match(
    /devoluci[oó]n de\s+(RD\s*\$?\s*[\d,]+(?:\.\d{1,2})?)[\s\S]*?en fecha\s+([\d/\s]+)/i,
  );
  if (!match) return null;

  const amount = parsePopularAmount(match[1]);
  const date = parsePopularDate(match[2]);
  if (amount === null || date === null) return null;

  return {
    type: "income",
    merchant: "Reverso por sobregiro",
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

/** Correos del Popular que no representan un movimiento de dinero. */
export function isIgnorablePopularEmail(subject: string): boolean {
  return /actualizaci[oó]n de l[ií]mite|tarjeta bloqueada/i.test(subject);
}

export function parsePopularEmail(subject: string, rawBody: string): ParsedBankEmail | null {
  const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;
  const s = subject.toLowerCase();

  if (s.includes("notificación de consumo") || s.includes("notificacion de consumo")) {
    return buildConsumo(body);
  }
  if (s.includes("retiro código cash") || s.includes("retiro codigo cash")) {
    return buildRetiroCodigoCash(body);
  }
  if (s.includes("notificación de retiro") || s.includes("notificacion de retiro")) {
    return buildRetiro(body);
  }
  if (s.includes("depósito por atm") || s.includes("deposito por atm")) {
    return buildDeposito(body);
  }
  if (s.includes("pagos al instante") && s.includes("enviada")) {
    return buildPagoInstante(body);
  }
  if (s.includes("reverso a cuenta por sobregiro")) {
    return buildReversoSobregiro(body);
  }
  return null;
}
