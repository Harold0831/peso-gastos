import type { ParsedBankEmail } from "./types";
import { isIgnorableQikEmail, parseQikEmail } from "./qik-parser";
import { isIgnorablePopularEmail, parsePopularEmail } from "./popular-parser";
import { parseCaribeEmail } from "./caribe-parser";

/**
 * Registro de bancos soportados. Para agregar un banco nuevo:
 *  1. Consigue 2+ correos REALES (no adivines el formato — lección
 *     aprendida dos veces con Qik).
 *  2. Crea su <banco>-parser.ts con fixtures de esos correos en tests.
 *  3. Agrégalo aquí (remitentes + parse + isIgnorable).
 * El filtro de búsqueda en Gmail se arma con todos los remitentes de esta
 * lista (ver gmail.ts) — un remitente que no esté aquí nunca se sincroniza.
 */

interface BankDefinition {
  name: string;
  senders: string[];
  parse: (subject: string, body: string) => ParsedBankEmail | null;
  isIgnorable: (subject: string, body: string) => boolean;
}

const BANKS: BankDefinition[] = [
  {
    name: "Qik",
    senders: ["no-reply-qik@qik.com.do", "notificaciones@qik.do"],
    parse: parseQikEmail,
    isIgnorable: (subject, body) => isIgnorableQikEmail(subject, body),
  },
  {
    name: "Banco Popular",
    senders: ["notificaciones@popularenlinea.com"],
    parse: parsePopularEmail,
    isIgnorable: (subject) => isIgnorablePopularEmail(subject),
  },
  {
    name: "Banco Caribe",
    senders: ["notificaciones@bancocaribe.com.do"],
    parse: parseCaribeEmail,
    // Solo conocemos un tipo de correo de Caribe; lo que no parsee se
    // ignora sin error hasta catalogar más tipos reales.
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
): ParsedBankEmail | null {
  return bankForSender(from)?.parse(subject, body) ?? null;
}

/** true si el correo es ruido esperado del banco (no reportar como error). */
export function isIgnorableBankEmail(from: string, subject: string, body: string): boolean {
  const bank = bankForSender(from);
  if (!bank) return true; // remitente desconocido: nunca debió llegar aquí
  return bank.isIgnorable(subject, body);
}
