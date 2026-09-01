import type { ParsedBankEmail } from "./types";
import type { BankId } from "./banks";
import { isIgnorableQikEmail, parseQikEmail } from "./qik-parser";
import { isIgnorablePopularEmail, parsePopularEmail } from "./popular-parser";
import { parseCaribeEmail } from "./caribe-parser";
import { parseScotiabankEmail } from "./scotiabank-parser";
import { parseBhdEmail } from "./bhd-parser";
import { parseBanreservasEmail } from "./banreservas-parser";

/**
 * Registro de bancos soportados. Para agregar un banco nuevo:
 *  1. Consigue 2+ correos REALES (no adivines el formato — lección
 *     aprendida dos veces con Qik).
 *  2. Crea su <banco>-parser.ts con fixtures de esos correos en tests.
 *  3. Agrégalo aquí (remitentes + parse + isIgnorable).
 * El filtro de búsqueda en Gmail se arma con todos los remitentes de esta
 * lista (ver gmail.ts) — un remitente que no esté aquí nunca se sincroniza.
 *
 * `receivedAt` (cuándo llegó el correo) se pasa a todos los parsers pero
 * solo lo usa Scotiabank: sus correos traen hora sin fecha.
 */

interface BankDefinition {
  /** Id del catálogo compartido (banks.ts) — se guarda en enabled_banks. */
  id: BankId;
  name: string;
  senders: string[];
  parse: (subject: string, body: string, receivedAt: Date) => ParsedBankEmail | null;
  isIgnorable: (subject: string, body: string) => boolean;
}

const BANKS: BankDefinition[] = [
  {
    id: "qik",
    name: "Qik",
    senders: ["no-reply-qik@qik.com.do", "notificaciones@qik.do"],
    parse: (subject, body) => parseQikEmail(subject, body),
    isIgnorable: (subject, body) => isIgnorableQikEmail(subject, body),
  },
  {
    id: "popular",
    name: "Banco Popular",
    senders: ["notificaciones@popularenlinea.com"],
    parse: (subject, body) => parsePopularEmail(subject, body),
    isIgnorable: (subject) => isIgnorablePopularEmail(subject),
  },
  {
    id: "caribe",
    name: "Banco Caribe",
    senders: ["notificaciones@bancocaribe.com.do"],
    parse: (subject, body) => parseCaribeEmail(subject, body),
    // Solo conocemos un tipo de correo de Caribe; lo que no parsee se
    // ignora sin error hasta catalogar más tipos reales.
    isIgnorable: () => true,
  },
  {
    id: "scotiabank",
    name: "Scotiabank",
    senders: ["alertas@scotiabank.com"],
    parse: (subject, body, receivedAt) => parseScotiabankEmail(subject, body, receivedAt),
    // Scotiabank manda muchos tipos de alerta (logins, etc.) que no hemos
    // catalogado — lo desconocido se ignora sin error.
    isIgnorable: () => true,
  },
  {
    id: "bhd",
    name: "BHD",
    senders: ["alertas@bhd.com.do", "notificaciones@bhd.com.do"],
    parse: (subject, body) => parseBhdEmail(subject, body),
    // "Pagos al Instante en Proceso" es un estado intermedio que duplicaría
    // la transacción final (isIgnorableBhdEmail); el resto de tipos no
    // catalogados también se ignora en silencio.
    isIgnorable: () => true,
  },
  {
    id: "banreservas",
    name: "Banreservas",
    senders: ["notificaciones@banreservas.com", "notificacionestubancoapp@banreservas.com"],
    parse: (subject, body) => parseBanreservasEmail(subject, body),
    // Solo conocemos 3 tipos de correo (ver banreservas-parser.ts); el
    // resto se ignora sin error hasta catalogar más tipos reales.
    isIgnorable: () => true,
  },
];

export const BANK_SENDERS = BANKS.flatMap((b) => b.senders);

/**
 * Remitentes a buscar en Gmail según los bancos elegidos por el usuario.
 * `null`/vacío = todos (default histórico: nadie pierde sync). Ids
 * desconocidos se ignoran — si un banco se elimina del registro, las
 * preferencias viejas no rompen el filtro.
 */
export function sendersForBanks(enabledBanks: string[] | null): string[] {
  if (!enabledBanks || enabledBanks.length === 0) return BANK_SENDERS;
  const senders = BANKS.filter((b) => enabledBanks.includes(b.id)).flatMap((b) => b.senders);
  return senders.length > 0 ? senders : BANK_SENDERS;
}

function bankForSender(from: string): BankDefinition | null {
  const address = from.toLowerCase();
  return BANKS.find((b) => b.senders.some((s) => address.includes(s))) ?? null;
}

/** Parsea un correo bancario según su remitente. */
export function parseBankEmail(
  from: string,
  subject: string,
  body: string,
  receivedAt: Date,
): ParsedBankEmail | null {
  return bankForSender(from)?.parse(subject, body, receivedAt) ?? null;
}

/**
 * Nombre del banco de un remitente, para los avisos de monitoreo.
 *
 * Sin esto, el aviso decía solo el id del correo y su asunto — para saber qué
 * parser tocar había que ir a mirar el código banco por banco. El nombre es
 * lo primero que hace falta cuando llega la notificación.
 */
export function bankNameForSender(from: string): string {
  return bankForSender(from)?.name ?? "remitente desconocido";
}

/** true si el correo es ruido esperado del banco (no reportar como error). */
export function isIgnorableBankEmail(from: string, subject: string, body: string): boolean {
  const bank = bankForSender(from);
  if (!bank) return true; // remitente desconocido: nunca debió llegar aquí
  return bank.isIgnorable(subject, body);
}
