import type { ParsedBankEmail } from "./types";
import { isIgnorableQikEmail, parseQikEmail } from "./qik-parser";
import { isIgnorablePopularEmail, parsePopularEmail } from "./popular-parser";
import { parseCaribeEmail } from "./caribe-parser";
import { parseScotiabankEmail } from "./scotiabank-parser";
import { parseBhdEmail } from "./bhd-parser";

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
  name: string;
  senders: string[];
  parse: (subject: string, body: string, receivedAt: Date) => ParsedBankEmail | null;
  isIgnorable: (subject: string, body: string) => boolean;
}

const BANKS: BankDefinition[] = [
  {
    name: "Qik",
    senders: ["no-reply-qik@qik.com.do", "notificaciones@qik.do"],
    parse: (subject, body) => parseQikEmail(subject, body),
    isIgnorable: (subject, body) => isIgnorableQikEmail(subject, body),
  },
  {
    name: "Banco Popular",
    senders: ["notificaciones@popularenlinea.com"],
    parse: (subject, body) => parsePopularEmail(subject, body),
    isIgnorable: (subject) => isIgnorablePopularEmail(subject),
  },
  {
    name: "Banco Caribe",
    senders: ["notificaciones@bancocaribe.com.do"],
    parse: (subject, body) => parseCaribeEmail(subject, body),
    // Solo conocemos un tipo de correo de Caribe; lo que no parsee se
    // ignora sin error hasta catalogar más tipos reales.
    isIgnorable: () => true,
  },
  {
    name: "Scotiabank",
    senders: ["alertas@scotiabank.com"],
    parse: (subject, body, receivedAt) => parseScotiabankEmail(subject, body, receivedAt),
    // Scotiabank manda muchos tipos de alerta (logins, etc.) que no hemos
    // catalogado — lo desconocido se ignora sin error.
    isIgnorable: () => true,
  },
  {
    name: "BHD",
    senders: ["alertas@bhd.com.do", "notificaciones@bhd.com.do"],
    parse: (subject, body) => parseBhdEmail(subject, body),
    // "Pagos al Instante en Proceso" es un estado intermedio que duplicaría
    // la transacción final (isIgnorableBhdEmail); el resto de tipos no
    // catalogados también se ignora en silencio.
    isIgnorable: () => true,
  },
];

export const BANK_SENDERS = BANKS.flatMap((b) => b.senders);

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

/** true si el correo es ruido esperado del banco (no reportar como error). */
export function isIgnorableBankEmail(from: string, subject: string, body: string): boolean {
  const bank = bankForSender(from);
  if (!bank) return true; // remitente desconocido: nunca debió llegar aquí
  return bank.isIgnorable(subject, body);
}
