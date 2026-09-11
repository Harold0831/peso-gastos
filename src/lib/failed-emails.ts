import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { decryptToken, encryptToken } from "./crypto";

/**
 * Correos que el parser no pudo leer, guardados cifrados y con caducidad.
 *
 * Por qué existe: cuando un banco cambia el formato, el parser deja de
 * reconocer sus correos y las transacciones dejan de aparecer EN SILENCIO. El
 * monitoreo avisa y manda el esqueleto del correo, pero un esqueleto no basta
 * cuando el formato cambia entero — pasó con el Popular, donde el aviso decía
 * "Etiquetas encontradas: ninguna". Y como el webhook dispara para el buzón
 * que CAMBIÓ, el correo casi nunca es de quien opera la instancia: sin esto no
 * hay forma de conseguir la muestra con la que arreglar el parser.
 *
 * Lo que NO hace, a propósito:
 *  - No guarda correos que sí se parsearon, ni los ignorables. Solo fallos.
 *  - No es un archivo: cada fila nace con `expires_at` y el cron diario la
 *    borra. Lo que se guarda es una muestra para depurar, no un historial.
 *  - No reemplaza a Gmail como fuente: una vez arreglado el parser, el
 *    backfill (`GET /api/sync?days=N`) vuelve a leer los correos de verdad.
 *    Esta copia solo sirve para ESCRIBIR el arreglo.
 */

/**
 * Cuánto vive una muestra. 30 días es el tiempo realista entre que llega el
 * aviso a Discord y alguien se sienta a arreglar el parser; pasado eso, la
 * muestra ya no vale para nada y guardarla solo es riesgo.
 */
export const FAILED_EMAIL_RETENTION_DAYS = 30;

interface FailedEmailInput {
  userId: string;
  gmailMessageId: string;
  bank: string;
  subject: string;
  from: string;
  receivedAt?: Date | null;
  body: string;
}

/**
 * Guarda (o refresca) la muestra de un correo que no se pudo parsear.
 *
 * `upsert` sobre (user_id, gmail_message_id) porque un correo roto vuelve a
 * fallar en CADA sync mientras el parser no cambie: sin esto, un solo correo
 * acumularía una fila por corrida. Refrescar en vez de ignorar mantiene viva
 * la muestra de un problema que sigue ocurriendo.
 *
 * Fallo suave y deliberado: esto existe para ARREGLAR el sync, así que jamás
 * puede tumbarlo. Si el cifrado o la escritura fallan, se loguea y el sync
 * sigue como si nada.
 */
export async function saveFailedEmail(input: FailedEmailInput): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + FAILED_EMAIL_RETENTION_DAYS * 86_400_000);
    const { error } = await getSupabaseAdmin()
      .from("failed_emails")
      .upsert(
        {
          user_id: input.userId,
          gmail_message_id: input.gmailMessageId,
          bank: input.bank,
          subject: input.subject,
          from_address: input.from,
          received_at: input.receivedAt?.toISOString() ?? null,
          body_enc: encryptToken(input.body),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: "user_id,gmail_message_id" },
      );
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[saveFailedEmail] no se pudo guardar la muestra:", err);
  }
}

export interface FailedEmailSample {
  id: string;
  bank: string;
  subject: string;
  from: string;
  receivedAt: string | null;
  createdAt: string;
  expiresAt: string;
  body: string;
}

/**
 * Lee las muestras para arreglar un parser (endpoint admin).
 *
 * Devuelve el cuerpo ya descifrado: es justo el punto. Por eso el endpoint
 * que la llama está detrás de `ADMIN_SECRET` y limitado por IP.
 */
export async function listFailedEmails(options?: {
  bank?: string;
  limit?: number;
}): Promise<FailedEmailSample[]> {
  let query = getSupabaseAdmin()
    .from("failed_emails")
    .select("id, bank, subject, from_address, received_at, created_at, expires_at, body_enc")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 20);
  if (options?.bank) query = query.eq("bank", options.bank);

  const { data, error } = await query;
  if (error) throw new Error(`Error leyendo muestras: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    bank: row.bank as string,
    subject: row.subject as string,
    from: row.from_address as string,
    receivedAt: (row.received_at as string | null) ?? null,
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    // Si la clave cambió, una muestra ilegible no debe tumbar la lista entera.
    body: safeDecrypt(row.body_enc as string),
  }));
}

function safeDecrypt(encrypted: string): string {
  try {
    return decryptToken(encrypted);
  } catch (err) {
    console.error("[listFailedEmails] muestra ilegible:", err);
    return "(no se pudo descifrar)";
  }
}

/**
 * Borra las muestras vencidas. Lo llama el cron diario que ya renueva los
 * watches de Gmail: la caducidad tiene que ser un barrido real y no una
 * promesa en un comentario.
 */
export async function purgeExpiredFailedEmails(): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("failed_emails")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");
  if (error) throw new Error(`Error purgando muestras: ${error.message}`);
  return (data ?? []).length;
}
