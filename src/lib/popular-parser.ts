import type { Currency, ParsedBankEmail } from "./types";
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
 *   7. "Notificación transferencia recibida por canal digital" → ingreso
 *      (confirmado 2026-09-11)
 *
 * A diferencia de Qik (label: valor por línea), el Popular usa tablas
 * COLUMNARES: primero todas las etiquetas (Monto/Moneda/Fecha/Comercio/
 * Estatus) y después todos los valores en el mismo orden. Y las manda de DOS
 * formas distintas, que zipColumns() soporta las dos: una etiqueta por línea
 * (la versión HTML) o todas en una línea separadas por TABULADORES (la de
 * texto plano, vista el 2026-09-11). En la segunda, un valor puede partirse
 * en varias líneas — el nombre del comercio, sin ir más lejos.
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
function parseCurrency(raw: string | null): Currency {
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
    .map((l) => l.replace(/\r/g, ""))
    .filter((l) => l.trim());

  return zipOnePerLine(lines, labels) ?? zipTabSeparated(lines, labels);
}

/** Forma clásica: una etiqueta por línea y después los valores en orden. */
function zipOnePerLine(lines: string[], labels: string[]): Map<string, string> | null {
  const trimmed = lines.map((l) => l.trim());
  for (let i = 0; i + labels.length * 2 <= trimmed.length + 1; i++) {
    const matches = labels.every((label, k) =>
      trimmed[i + k]?.toLowerCase().endsWith(label.toLowerCase()),
    );
    if (!matches) continue;
    const values = trimmed.slice(i + labels.length, i + labels.length * 2);
    if (values.length < labels.length) return null;
    return new Map(labels.map((label, k) => [label, values[k]]));
  }
  return null;
}

/**
 * Forma vista en producción el 2026-09-11: TODAS las etiquetas en una sola
 * línea separadas por tabuladores, y los valores igual.
 *
 * Llega así cuando el correo trae parte de texto plano (la versión en HTML sí
 * pone cada celda en su línea). El parser solo conocía la primera forma, así
 * que consumos y retiros dejaron de leerse en silencio.
 *
 * La trampa está en los valores: **un valor puede partirse en varias líneas**
 * ("STARBUCKS\nCUMAYASA"). Por eso no se lee una línea sino que se van
 * uniendo líneas hasta juntar tantos campos como etiquetas — quedarse en la
 * primera daría "STARBUCKS" y perdería media mitad del nombre del comercio.
 */
function zipTabSeparated(lines: string[], labels: string[]): Map<string, string> | null {
  const split = (line: string) => line.split("\t").map((c) => c.trim());
  /** Quita las columnas vacías del final que deja el tab de cierre. */
  const trimTrailing = (cells: string[]) => {
    const out = [...cells];
    while (out.length > 0 && out[out.length - 1] === "") out.pop();
    return out;
  };

  for (let i = 0; i < lines.length; i++) {
    const header = trimTrailing(split(lines[i]));
    if (header.length !== labels.length) continue;
    const isHeader = labels.every((label, k) => header[k]?.toLowerCase() === label.toLowerCase());
    if (!isHeader) continue;

    // Une líneas hasta completar las columnas. El tope evita tragarse el pie
    // del correo si la tabla viniera incompleta.
    let joined = "";
    for (let j = i + 1; j < lines.length && j <= i + labels.length; j++) {
      joined = joined ? `${joined} ${lines[j]}` : lines[j];
      const values = trimTrailing(split(joined));
      if (values.length === labels.length) {
        return new Map(labels.map((label, k) => [label, values[k]]));
      }
      if (values.length > labels.length) return null; // más columnas que etiquetas: no es la tabla
    }
    return null;
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

/**
 * "Notificación transferencia recibida por canal digital" → INGRESO.
 *
 * Tipo nuevo, visto el 2026-09-11: no estaba en el parser, así que TODAS las
 * transferencias recibidas por el Popular se perdían. Era además el fallo más
 * frecuente de la tabla de muestras.
 *
 * Comparte estructura con el depósito por ATM (Monto/Fecha/Canal), pero se
 * construye aparte porque el texto que ve el usuario es distinto y porque el
 * banco puede cambiarlos por separado.
 */
function buildTransferenciaRecibida(body: string): ParsedBankEmail | null {
  const cols = zipColumns(body, ["Monto", "Fecha", "Canal"]);
  if (!cols) return null;

  const amount = parsePopularAmount(cols.get("Monto") ?? "");
  const date = parsePopularDate(cols.get("Fecha") ?? "");
  if (amount === null || date === null) return null;

  const canal = cols.get("Canal");
  return {
    type: "income",
    // El correo NO dice quién envió el dinero, solo el canal. Ponerlo entre
    // paréntesis es más honesto que inventar un remitente.
    merchant: canal ? `Transferencia recibida (${canal})` : "Transferencia recibida",
    amount,
    currency: "DOP",
    date,
    // "su cuenta terminada en 0386" es una CUENTA, no una tarjeta. Pasarla a
    // card_last4 crearía una tarjeta fantasma en /cards y agruparía bajo ella
    // transferencias que no se hicieron con ninguna tarjeta.
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
  if (s.includes("transferencia recibida")) {
    return buildTransferenciaRecibida(body);
  }
  if (s.includes("pagos al instante") && s.includes("enviada")) {
    return buildPagoInstante(body);
  }
  if (s.includes("reverso a cuenta por sobregiro")) {
    return buildReversoSobregiro(body);
  }
  return null;
}
