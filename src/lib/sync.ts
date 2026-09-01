import "server-only";
import { GmailAuthError, fetchBankEmails } from "./gmail";
import { reportIssue } from "./monitoring";
import {
  bankNameForSender,
  isIgnorableBankEmail,
  parseBankEmail,
  sendersForBanks,
} from "./bank-parser";
import { suggestCategory } from "./gemini";
import { getSupabaseAdmin } from "./supabase";
import { decryptToken } from "./crypto";
import { getUsdToDopRate } from "./exchange-rate";
import { sendPushToUser } from "./push";

export interface SyncResult {
  synced: number;
  errors: string[];
}

interface GmailAccountRow {
  user_id: string;
  email: string;
  refresh_token_enc: string;
  sync_enabled: boolean;
  /** Ids de bank-parser.ts elegidos por el usuario; null = todos. */
  enabled_banks: string[] | null;
}

/**
 * Pipeline de sincronización de UN usuario:
 *  1. Trae correos recientes de los remitentes de Qik (ver gmail.ts)
 *  2. Descarta los que ya existen para ese usuario (gmail_message_id)
 *  3. Parsea cada correo nuevo con regex
 *  4. Descarta si el usuario ya tiene una transacción con mismo
 *     monto/fecha/tipo (Qik notifica algunos movimientos por dos correos)
 *  5. Pide sugerencia de categoría a Gemini (falla suave → sin sugerencia)
 *  6. Inserta con confirmed=false
 *
 * Si el refresh token fue revocado (GmailAuthError), marca la cuenta con
 * sync_enabled=false — el perfil muestra "reconectar Gmail" y los crons
 * dejan de intentar con esa cuenta hasta que se reconecte.
 */
export async function runSyncForUser(
  userId: string,
  newerThanDays?: number,
  options?: {
    /** Push "N por confirmar" al terminar. true en los syncs automáticos
     *  (webhook/cron); false en el manual — el usuario ya está mirando. */
    notify?: boolean;
  },
): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];

  const { data: account, error: accountError } = await supabase
    .from("gmail_accounts")
    .select("user_id, email, refresh_token_enc, sync_enabled, enabled_banks")
    .eq("user_id", userId)
    .maybeSingle();
  if (accountError) throw new Error(`Error cargando cuenta de Gmail: ${accountError.message}`);
  if (!account) {
    return { synced: 0, errors: ["Este usuario no tiene Gmail vinculado"] };
  }

  let emails;
  try {
    emails = await fetchBankEmails(
      decryptToken(account.refresh_token_enc),
      newerThanDays,
      sendersForBanks(account.enabled_banks),
    );
  } catch (err) {
    if (err instanceof GmailAuthError) {
      await supabase.from("gmail_accounts").update({ sync_enabled: false }).eq("user_id", userId);
      return { synced: 0, errors: ["El acceso a Gmail expiró — reconéctalo desde tu perfil"] };
    }
    throw err;
  }
  if (emails.length === 0) return { synced: 0, errors };

  // Deliberadamente sin filtrar deleted_at: si el usuario eliminó la
  // transacción (soft delete), el correo sigue existiendo en Gmail y no
  // debe re-insertarse solo porque ya no aparece en la UI.
  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("gmail_message_id")
    .eq("user_id", userId)
    .in(
      "gmail_message_id",
      emails.map((e) => e.id),
    );
  if (existingError) {
    throw new Error(`Error consultando duplicados: ${existingError.message}`);
  }
  const known = new Set((existing ?? []).map((r) => r.gmail_message_id));
  const newEmails = emails.filter((e) => !known.has(e.id));
  if (newEmails.length === 0) return { synced: 0, errors };

  // Globales (seed) + las propias del usuario, para que Gemini pueda sugerir
  // también las categorías personalizadas al clasificar sus correos. Las que
  // el usuario ocultó (migración 0011) se excluyen: no tiene sentido
  // sugerirle una categoría que quitó de su lista.
  const [{ data: categories, error: catError }, { data: hidden, error: hiddenError }] =
    await Promise.all([
      supabase.from("categories").select("id, name").or(`user_id.is.null,user_id.eq.${userId}`),
      supabase.from("hidden_categories").select("category_id").eq("user_id", userId),
    ]);
  if (catError) throw new Error(`Error cargando categorías: ${catError.message}`);
  if (hiddenError) throw new Error(`Error cargando categorías ocultas: ${hiddenError.message}`);
  const hiddenIds = new Set((hidden ?? []).map((h) => h.category_id));
  const categoryNames = (categories ?? []).filter((c) => !hiddenIds.has(c.id)).map((c) => c.name);

  // Tasa USD→DOP del día, pedida una sola vez por corrida y solo si algún
  // correo viene en moneda extranjera. Fallo suave: sin tasa la transacción
  // se inserta igual con exchange_rate null (data.ts usa la última cacheada).
  let rateMemo: number | null | undefined;
  const getRate = async () => {
    if (rateMemo === undefined) rateMemo = await getUsdToDopRate();
    return rateMemo;
  };

  let synced = 0;
  for (const email of newEmails) {
    const parsed = parseBankEmail(email.from, email.subject, email.body, email.receivedAt);
    if (!parsed) {
      // Estados de cuenta, códigos CASH creados/vencidos, etc.: no son
      // transacciones y no representan un error de parseo.
      if (!isIgnorableBankEmail(email.from, email.subject, email.body)) {
        // El nombre del banco va primero: es lo que decide qué parser hay que
        // mirar cuando llega el aviso al webhook.
        errors.push(
          `[${bankNameForSender(email.from)}] "${email.subject}" — no se pudo parsear (correo ${email.id})`,
        );
      }
      continue;
    }

    // Qik a veces notifica el mismo movimiento por dos canales distintos
    // (p. ej. "Pago de servicio realizado" y, por separado, "Usaste tu
    // tarjeta…" para la misma factura pagada con débito) — mismo monto y
    // fecha/hora exacta pero gmail_message_id distinto, así que el chequeo
    // de duplicados de arriba no lo detecta. Sin esto se duplicaría el gasto.
    const { data: duplicate, error: dupError } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("amount", parsed.amount)
      .eq("date", parsed.date.toISOString())
      .eq("type", parsed.type)
      .maybeSingle();
    if (dupError) throw new Error(`Error consultando duplicados: ${dupError.message}`);
    if (duplicate) continue;

    const suggestion = await suggestCategory({
      merchant: parsed.merchant,
      amount: parsed.amount,
      currency: parsed.currency,
      type: parsed.type,
      availableCategories: categoryNames,
    });

    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: userId,
      gmail_message_id: email.id,
      type: parsed.type,
      merchant: parsed.merchant,
      amount: parsed.amount,
      currency: parsed.currency,
      exchange_rate: parsed.currency === "DOP" ? null : await getRate(),
      date: parsed.date.toISOString(),
      card_last4: parsed.card_last4,
      available_balance: parsed.available_balance,
      ai_suggested_category: suggestion?.category ?? null,
      confirmed: false,
      source: "email",
      raw_email_snippet: email.snippet,
    });

    if (insertError) {
      // 23505 = unique_violation: otro sync simultáneo lo insertó primero
      if (insertError.code !== "23505") {
        errors.push(`Error insertando ${email.id}: ${insertError.message}`);
      }
      continue;
    }
    synced++;
  }

  if (options?.notify && synced > 0) {
    // Fallo suave: la notificación es un extra, nunca tumba el sync.
    await sendPushToUser(userId, {
      title: "Peso",
      body:
        synced === 1
          ? "1 transacción nueva por confirmar"
          : `${synced} transacciones nuevas por confirmar`,
      url: "/transactions?filter=pendientes",
    }).catch((err) => console.error("[sync] push falló:", err));
  }

  return { synced, errors };
}

/** Sincroniza al usuario dueño de una dirección de Gmail (webhook push). */
export async function runSyncForGmailAddress(email: string): Promise<SyncResult> {
  const { data: account, error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .select("user_id, sync_enabled")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Error buscando cuenta de Gmail: ${error.message}`);
  if (!account || !account.sync_enabled) {
    return { synced: 0, errors: [] }; // dirección desconocida o sync apagado: ignora
  }
  const result = await runSyncForUser(account.user_id, undefined, { notify: true });
  // La dirección va en el aviso porque sin ella el monitoreo es un callejón
  // sin salida: el correo que falló es de OTRA persona (el webhook dispara
  // para el buzón que cambió, no para el de quien recibe la alerta), así que
  // sin saber de quién es no hay forma de pedirle la muestra que hace falta
  // para arreglar el parser.
  await reportSyncErrors("sync automático (webhook)", {
    ...result,
    errors: result.errors.map((e) => `[${email.toLowerCase()}] ${e}`),
  });
  return result;
}

/**
 * Avisa si un sync AUTOMÁTICO dejó errores. Solo los automáticos: el manual
 * ya le enseña un toast al usuario, que está mirando la pantalla.
 *
 * Sin esto, un banco que cambia el formato de sus correos deja de importar
 * transacciones en silencio — los errores se acumulan en `SyncResult.errors`
 * y se devuelven en una respuesta JSON que nadie abre.
 */
async function reportSyncErrors(context: string, result: SyncResult): Promise<void> {
  if (result.errors.length === 0) return;
  await reportIssue({
    context,
    message: `${result.errors.length} correo(s) no se pudieron procesar (${result.synced} sincronizados).`,
    details: result.errors,
  });
}

/** Sincroniza todos los usuarios con Gmail vinculado (GET /api/sync). */
export async function runSyncAll(newerThanDays?: number): Promise<SyncResult> {
  const { data: accounts, error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .select("user_id, email, refresh_token_enc, sync_enabled, enabled_banks")
    .eq("sync_enabled", true);
  if (error) throw new Error(`Error listando cuentas de Gmail: ${error.message}`);

  let synced = 0;
  const errors: string[] = [];
  for (const account of (accounts ?? []) as GmailAccountRow[]) {
    try {
      const result = await runSyncForUser(account.user_id, newerThanDays, { notify: true });
      synced += result.synced;
      errors.push(...result.errors.map((e) => `[${account.email}] ${e}`));
    } catch (err) {
      errors.push(`[${account.email}] ${err instanceof Error ? err.message : "Error"}`);
    }
  }
  const result = { synced, errors };
  await reportSyncErrors("sync de todos los usuarios", result);
  return result;
}
