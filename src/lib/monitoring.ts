import "server-only";
import { checkRateLimit } from "./rate-limit";

/**
 * Avisos de que algo se rompió, a un webhook.
 *
 * El problema que resuelve: cuando un banco cambia el formato de sus correos,
 * el parser deja de reconocerlos y las transacciones simplemente DEJAN DE
 * APARECER. No hay excepción, no hay pantalla roja — `SyncResult.errors` se
 * llena y se devuelve en un JSON que nadie lee. Es exactamente el bug de los
 * ~300 correos de `qik.do` que pasó un año sin que nadie lo notara.
 *
 * Es un `fetch` a un webhook y no un SDK de errores (Sentry y compañía) por
 * coherencia con el resto del proyecto: sin dependencias nuevas ni peso extra
 * en el cold start de las functions. Con un webhook entrante de Discord o
 * Slack basta.
 *
 * **Todo esto es opcional**: sin `MONITORING_WEBHOOK_URL` no se manda nada y
 * la app se comporta igual. Y nunca lanza — un aviso que falla no puede
 * tumbar el sync que lo estaba reportando.
 */

export interface Issue {
  /** De dónde viene, para agrupar de un vistazo: "sync", "cron"… */
  context: string;
  /** Una línea: qué pasó. */
  message: string;
  /** Detalle largo (los errores concretos). Se recorta antes de enviar. */
  details?: string[];
}

const MAX_DETAILS = 10;
const MAX_LENGTH = 1500;

/**
 * Cada aviso repetido cuesta una notificación en el teléfono de alguien. Un
 * banco que cambia de formato falla en CADA sync, así que sin freno serían
 * decenas de mensajes al día diciendo lo mismo: se manda como mucho uno por
 * hora y por contexto.
 */
const THROTTLE_SECONDS = 3600;

export async function reportIssue(issue: Issue): Promise<void> {
  const url = process.env.MONITORING_WEBHOOK_URL;
  if (!url) return;

  try {
    const allowed = await checkRateLimit(`monitor:${issue.context}`, 1, THROTTLE_SECONDS);
    if (!allowed) return;

    const body = formatIssue(issue);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `content` lo lee Discord y `text` lo lee Slack; mandar ambos hace
      // que el mismo webhook sirva para los dos sin configurar nada más.
      body: JSON.stringify({ content: body, text: body }),
    });
    if (!res.ok) {
      console.error("[reportIssue] el webhook respondió", res.status);
    }
  } catch (err) {
    // Fallo suave a propósito: ver arriba.
    console.error("[reportIssue] no se pudo enviar el aviso:", err);
  }
}

/** Mensaje en texto plano, recortado para no reventar el límite del webhook. */
export function formatIssue(issue: Issue): string {
  const lines = [`⚠️ Peso · ${issue.context}`, issue.message];

  const details = issue.details ?? [];
  if (details.length > 0) {
    lines.push("", ...details.slice(0, MAX_DETAILS));
    if (details.length > MAX_DETAILS) {
      lines.push(`…y ${details.length - MAX_DETAILS} más`);
    }
  }

  const text = lines.join("\n");
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}
