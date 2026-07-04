import type { ParsedQikEmail } from "./types";

/**
 * Parser de correos de notificación del banco Qik.
 *
 * Qik notifica desde DOS remitentes distintos (ver gmail.ts): la mayoría
 * de tipos vienen de no-reply-qik@qik.com.do, pero las compras con tarjeta
 * llegan de notificaciones@qik.do — un dominio distinto, fácil de pasar
 * por alto (bug real: se perdieron ~200 correos de compras por filtrar
 * solo el primer remitente, corregido el 2026-07-04, ver git log).
 *
 * Tipos de correo transaccionales confirmados contra la bandeja real:
 *
 *   1. "Pago de servicio realizado"                    → gasto (pago de factura)
 *   2. "Retiro con Código CASH exitoso"                → gasto (retiro en cajero)
 *   3. Cuerpo con "Has recibido RD$…"                  → ingreso (Toke recibido, P2P)
 *   4. "Usaste tu tarjeta…" / "Se hizo una transacción
 *      con tu tarjeta…" (con "Estatus: Aprobada")       → gasto (compra con tarjeta)
 *   5. "Se reversó una transacción…"                    → ingreso (reembolso)
 *
 * Las compras con tarjeta tienen DOS plantillas según la fecha del correo:
 * una vieja (2025, campos "Lugar"/"Estatus", montos con solo "$") y una
 * nueva (2026, campos "Localidad"/"Balance Disponible", montos "RD$") — el
 * parser acepta ambas. La plantilla vieja también manda "Estatus:
 * Declinado" cuando el banco rechaza la compra (fondos insuficientes, CVV
 * inválido, etc.) — no representa un gasto real y se ignora.
 *
 * Otros correos del banco (Código CASH creado/vencido, estados de cuenta,
 * recordatorio de fecha de pago, OTP de verificación, alertas de límite
 * de tarjeta, compras declinadas) no representan un movimiento de dinero;
 * se detectan con isIgnorableQikEmail() para no reportarlos como error
 * de parseo en el sync.
 *
 * Si Qik agrega un tipo de correo nuevo (p. ej. "Toke enviado" o compras
 * con tarjeta de crédito), añade el correo real como caso de test en
 * qik-parser.test.ts y un nuevo builder aquí — no adivines el formato.
 */

const MESES: Record<string, number> = {
  ene: 0,
  enero: 0,
  feb: 1,
  febrero: 1,
  mar: 2,
  marzo: 2,
  abr: 3,
  abril: 3,
  may: 4,
  mayo: 4,
  jun: 5,
  junio: 5,
  jul: 6,
  julio: 6,
  ago: 7,
  agosto: 7,
  sep: 8,
  sept: 8,
  septiembre: 8,
  setiembre: 8,
  oct: 9,
  octubre: 9,
  nov: 10,
  noviembre: 10,
  dic: 11,
  diciembre: 11,
};

/** Convierte HTML a texto plano conservando saltos de línea útiles para el parser. */
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
    .replace(/&iexcl;/gi, "¡")
    .replace(/&iquest;/gi, "¿")
    .replace(/&copy;/gi, "©")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Busca un campo "Label" con su valor en la misma línea o en la línea
 * siguiente. Requiere que la línea EMPIECE con el label (no basta con que
 * lo contenga) — los correos de Qik repiten palabras como "servicio" en
 * frases sueltas antes del campo real, y matchear en cualquier parte del
 * texto agarraría la línea equivocada.
 */
function extractField(text: string, label: string): string | null {
  const lines = text.split("\n");
  const labelRe = new RegExp(`^${escapeRegExp(label)}\\s*:?\\s*(.*)$`, "i");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(labelRe);
    if (!match) continue;
    if (match[1].trim()) return match[1].trim();
    const next = lines[i + 1]?.trim();
    return next || null;
  }
  return null;
}

/**
 * "RD$ 2,840.50" → 2840.5. El "RD" es opcional: la plantilla vieja de
 * compras con tarjeta manda montos como "$ 20.00", sin el prefijo "RD".
 */
export function parseAmount(raw: string): number | null {
  const match = raw.match(/(?:RD)?\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Fechas de Qik en tres formatos según el tipo de correo:
 *   - "07-04-2026 01:11 PM (AST)" (numérico MM-DD-YYYY, compras con tarjeta)
 *   - "02 julio 2026 / 10:57 a. m." (español, con hora, mes completo)
 *   - "18 de jun 2026" / "30 de jun. 2026" (español, sin hora, mes abreviado)
 *
 * AST (hora de RD) es UTC-4 fijo. Sin hora explícita se usa mediodía para
 * no cruzar el límite del día al convertir a UTC cerca de la medianoche.
 */
export function parseQikDate(raw: string): Date | null {
  const numeric = raw.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*([ap])m/i);
  if (numeric) {
    const [, mm, dd, yyyy, hh, min, meridiem] = numeric;
    let hour = Number(hh) % 12;
    if (meridiem.toLowerCase() === "p") hour += 12;
    const date = new Date(
      Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour + 4, Number(min)),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const spanish = raw.match(
    /(\d{1,2})\s+(?:de\s+)?([a-zá-úñ]+)\.?\s+(\d{4})(?:\s*\/\s*(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?)?/i,
  );
  if (!spanish) return null;
  const [, dd, monthRaw, yyyy, hh, min, meridiem] = spanish;
  const month = MESES[monthRaw.toLowerCase()];
  if (month === undefined) return null;

  let hour = 12;
  let minute = 0;
  if (hh && min && meridiem) {
    hour = Number(hh) % 12;
    if (meridiem.toLowerCase() === "p") hour += 12;
    minute = Number(min);
  }

  const date = new Date(Date.UTC(Number(yyyy), month, Number(dd), hour + 4, minute));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Últimos 4 dígitos de una tarjeta a partir de "Visa *3326", "**** 4521", etc. */
function extractLast4(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{4})\D*$/);
  return match ? match[1] : null;
}

/**
 * Correos del banco que no representan un movimiento de dinero: código
 * CASH creado/vencido, estados de cuenta, recordatorio de fecha de pago,
 * OTP de verificación, alertas de límite de tarjeta (duplican una compra
 * que ya llega por su propio correo) y compras con tarjeta declinadas
 * (detectadas por el campo "Estatus" del cuerpo, ya que el asunto no
 * distingue aprobada de declinada). El sync los descarta en silencio en
 * vez de reportarlos como error de parseo.
 */
export function isIgnorableQikEmail(subject: string, rawBody?: string): boolean {
  if (
    /c[oó]digo cash (para|se ha)|estado de cuenta|fecha de pago se acerca|contrase[ñn]a de uso [uú]nico|cardholder services alert/i.test(
      subject,
    )
  ) {
    return true;
  }
  if (rawBody) {
    const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;
    const status = extractField(body, "Estatus");
    if (status && !/^(aprobada|exitoso)$/i.test(status.trim())) return true;
  }
  return false;
}

function buildServicePayment(body: string): ParsedQikEmail | null {
  const amountRaw = extractField(body, "Monto total pagado");
  const dateRaw = extractField(body, "Fecha y hora");
  const service = extractField(body, "Servicio");
  const paymentMethod = extractField(body, "Forma de pago");
  if (!amountRaw || !dateRaw || !service) return null;

  const amount = parseAmount(amountRaw);
  const date = parseQikDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "expense",
    merchant: service,
    amount,
    currency: "DOP",
    date,
    card_last4: extractLast4(paymentMethod),
    available_balance: null,
  };
}

function buildCashWithdrawal(body: string): ParsedQikEmail | null {
  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha");
  if (!amountRaw || !dateRaw) return null;

  const amount = parseAmount(amountRaw);
  const date = parseQikDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "expense",
    merchant: "Retiro Código CASH",
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

function buildTokeReceived(body: string): ParsedQikEmail | null {
  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha");
  const sender = extractField(body, "Realizado por");
  if (!amountRaw || !dateRaw || !sender) return null;

  const amount = parseAmount(amountRaw);
  const date = parseQikDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "income",
    merchant: sender,
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

function buildCardPurchase(body: string): ParsedQikEmail | null {
  // La plantilla vieja manda "Estatus: Declinado" con el mismo asunto que
  // una aprobada — sin este chequeo se registraría un gasto que nunca
  // llegó a completarse.
  const status = extractField(body, "Estatus");
  if (status && !/^(aprobada|exitoso)$/i.test(status.trim())) return null;

  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha y hora");
  const merchant = extractField(body, "Localidad") ?? extractField(body, "Lugar");
  const cardField = extractField(body, "Tarjeta Débito") ?? extractField(body, "Tarjeta Crédito");
  const balanceRaw = extractField(body, "Balance Disponible");
  if (!amountRaw || !dateRaw || !merchant) return null;

  const amount = parseAmount(amountRaw);
  const date = parseQikDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "expense",
    merchant,
    amount,
    currency: "DOP",
    date,
    card_last4: extractLast4(cardField),
    available_balance: balanceRaw ? parseAmount(balanceRaw) : null,
  };
}

/** Reverso de una compra con tarjeta: los fondos vuelven a la cuenta. */
function buildCardReversal(body: string): ParsedQikEmail | null {
  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha y hora");
  const merchant = extractField(body, "Localidad") ?? extractField(body, "Lugar");
  if (!amountRaw || !dateRaw || !merchant) return null;

  const amount = parseAmount(amountRaw);
  const date = parseQikDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "income",
    merchant,
    amount,
    currency: "DOP",
    date,
    card_last4: null,
    available_balance: null,
  };
}

/**
 * Parsea un correo de Qik. Devuelve null si el correo no es de un tipo
 * transaccional reconocido o si le faltan campos mínimos — el sync
 * distingue "no transaccional" (isIgnorableQikEmail) de "error real" para
 * no llenar el log de ruido con estados de cuenta y códigos vencidos.
 */
export function parseQikEmail(subject: string, rawBody: string): ParsedQikEmail | null {
  const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;

  if (/pago de servicio realizado/i.test(subject)) {
    return buildServicePayment(body);
  }
  if (/retiro con c[oó]digo cash exitoso/i.test(subject)) {
    return buildCashWithdrawal(body);
  }
  if (/usaste tu tarjeta|se hizo una transacci[oó]n con tu tarjeta/i.test(subject)) {
    return buildCardPurchase(body);
  }
  if (/se revers[oó] una transacci[oó]n/i.test(subject)) {
    return buildCardReversal(body);
  }
  if (/has recibido/i.test(body)) {
    return buildTokeReceived(body);
  }
  return null;
}
