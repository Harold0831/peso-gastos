import type { Currency, ParsedBankEmail } from "./types";
import { htmlToText } from "./qik-parser";

/**
 * Parser de correos de Banreservas.
 *
 * Remitentes: `notificacionestubancoapp@banreservas.com` (recibos de la App)
 * y `notificaciones@banreservas.com` (transferencias recibidas y consumos
 * con tarjeta). Tipos confirmados contra correos reales (2026-08-03,
 * reenviados por un amigo de Harold):
 *
 *   1. **"Recibo de la transacción"** → gasto (transferencia enviada desde
 *      la App, ej. "Transferencia a Tercero"). Campos "Label:" con el valor
 *      en la línea siguiente; el merchant sale de "Destino" (se recorta
 *      antes de la coma — el resto es el tipo de cuenta y su número).
 *      Fecha en español: "15 de Julio 2026 - 11:37 AM".
 *   2. **"Notificaciones Banreservas"** con "Transferencia Recibida" en el
 *      cuerpo → ingreso. Mismos campos "Label:\nValor"; merchant sale de
 *      "Origen". Fecha numérica: "17/07/2026 08:48 AM".
 *   3. **"Notificaciones Banreservas"** con "Notificación de Consumo" en el
 *      cuerpo → gasto. Cubre TANTO compras con tarjeta como retiros de
 *      cajero — comparten exactamente la misma plantilla (confirmado con un
 *      correo real de cada caso); el "Comercio" ya da un merchant sensato
 *      en ambos ("PedidosYa..." o "BANCO RESERVAS...·retiro"). Solo se
 *      acepta si "Estado: APROBADO". card_last4 sale de "••0016".
 *
 * El asunto NO distingue #2 de #3 (ambos son "Notificaciones Banreservas")
 * — hay que mirar el cuerpo para decidir cuál es.
 *
 * **Bug real del propio banco**: la fecha a veces llega en 24h pero CON
 * sufijo "PM" pegado ("31/07/2026 17:32 PM", visto en un retiro de cajero
 * real). El parser detecta hora > 12 y la toma tal cual como 24h,
 * ignorando el sufijo — que en ese caso es ruido de la plantilla del banco.
 */

const MESES: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function parseBanreservasAmount(raw: string): number | null {
  const match = raw.match(/([\d,]+\.\d{2})/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

function currencyOf(raw: string): Currency {
  return /usd|us\$/i.test(raw) ? "USD" : "DOP";
}

/**
 * Dos formatos según el tipo de correo:
 *   - Español: "15 de Julio 2026 - 11:37 AM" (Recibo de la transacción)
 *   - Numérico: "17/07/2026 08:48 AM" (transferencia recibida y consumos)
 *
 * Ver nota del bug de 24h+PM arriba: con hora > 12 se ignora el sufijo
 * am/pm y se toma la hora tal cual.
 */
export function parseBanreservasDate(raw: string): Date | null {
  const spanish = raw.match(
    /(\d{1,2})\s+de\s+([a-zá-úñ]+)\s+(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*(am|pm)/i,
  );
  if (spanish) {
    const [, dd, mesRaw, yyyy, hh, min, meridiem] = spanish;
    const month = MESES[mesRaw.toLowerCase()];
    if (month === undefined) return null;
    let hour = Number(hh) % 12;
    if (meridiem.toLowerCase() === "pm") hour += 12;
    const date = new Date(Date.UTC(Number(yyyy), month, Number(dd), hour + 4, Number(min)));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const numeric = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (numeric) {
    const [, dd, mm, yyyy, hh, min, meridiem] = numeric;
    let hour = Number(hh);
    if (hour <= 12) {
      hour = hour % 12;
      if (meridiem.toLowerCase() === "pm") hour += 12;
    } // hour > 12: ya viene en 24h, el sufijo am/pm es ruido del banco
    const date = new Date(
      Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), hour + 4, Number(min)),
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/** "Label:" con el valor en la línea siguiente (formato de Banreservas). */
function extractField(body: string, label: string): string | null {
  const lines = body.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(new RegExp(`^${label}\\s*:?\\s*$`, "i"));
    if (match) return lines[i + 1]?.trim() || null;
    // Algunos campos pueden venir "Label: valor" en la misma línea.
    const inline = lines[i].match(new RegExp(`^${label}\\s*:\\s*(.+)$`, "i"));
    if (inline && inline[1].trim()) return inline[1].trim();
  }
  return null;
}

function buildAppTransfer(body: string): ParsedBankEmail | null {
  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha de transacción");
  const destino = extractField(body, "Destino");
  if (!amountRaw || !dateRaw) return null;

  const amount = parseBanreservasAmount(amountRaw);
  const date = parseBanreservasDate(dateRaw);
  if (amount === null || date === null) return null;

  // "SRA HENCY L MARTINEZ, Cuenta de ahorro DOP ** - 1681" → nombre solo.
  const merchant = destino?.split(",")[0]?.trim() || "Transferencia Banreservas";

  return {
    type: "expense",
    merchant,
    amount,
    currency: currencyOf(amountRaw),
    date,
    card_last4: null,
    available_balance: null,
  };
}

function buildTransferReceived(body: string): ParsedBankEmail | null {
  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha");
  const origen = extractField(body, "Origen");
  if (!amountRaw || !dateRaw) return null;

  const amount = parseBanreservasAmount(amountRaw);
  const date = parseBanreservasDate(dateRaw);
  if (amount === null || date === null) return null;

  return {
    type: "income",
    merchant: origen || "Transferencia recibida",
    amount,
    currency: currencyOf(amountRaw),
    date,
    card_last4: null,
    available_balance: null,
  };
}

function buildCardConsumption(body: string): ParsedBankEmail | null {
  // Igual que Qik/BHD: una notificación de consumo declinada usa la misma
  // plantilla que una aprobada — solo se acepta si el estado es APROBADO.
  if (!/estado\s*:?\s*\n?\s*aprobado/i.test(body)) return null;

  const amountRaw = extractField(body, "Monto");
  const dateRaw = extractField(body, "Fecha de transacción");
  const merchant = extractField(body, "Comercio");
  if (!amountRaw || !dateRaw || !merchant) return null;

  const amount = parseBanreservasAmount(amountRaw);
  const date = parseBanreservasDate(dateRaw);
  if (amount === null || date === null) return null;

  const cardMatch = body.match(/••\s*(\d{4})/);

  return {
    type: "expense",
    merchant,
    amount,
    currency: currencyOf(amountRaw),
    date,
    card_last4: cardMatch ? cardMatch[1] : null,
    available_balance: null,
  };
}

export function parseBanreservasEmail(subject: string, rawBody: string): ParsedBankEmail | null {
  const body = /<[a-z][\s\S]*>/i.test(rawBody) ? htmlToText(rawBody) : rawBody;
  const s = subject.toLowerCase();

  if (s.includes("recibo de la transacción") || s.includes("recibo de la transaccion")) {
    return buildAppTransfer(body);
  }

  if (s.includes("notificaciones banreservas")) {
    if (/transferencia recibida/i.test(body)) return buildTransferReceived(body);
    if (/notificaci[oó]n de consumo/i.test(body)) return buildCardConsumption(body);
  }

  return null;
}
