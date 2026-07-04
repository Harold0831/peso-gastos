import "server-only";
import { fetchQikEmails } from "./gmail";
import { isIgnorableQikEmail, parseQikEmail } from "./qik-parser";
import { suggestCategory } from "./gemini";
import { getSupabaseAdmin } from "./supabase";

export interface SyncResult {
  synced: number;
  errors: string[];
}

/**
 * Pipeline de sincronización:
 *  1. Trae correos recientes de los remitentes de Qik (ver gmail.ts)
 *  2. Descarta los que ya existen (gmail_message_id único)
 *  3. Parsea cada correo nuevo con regex
 *  4. Descarta si ya existe una transacción con mismo monto/fecha/tipo
 *     (Qik notifica algunos movimientos por dos correos distintos)
 *  5. Pide sugerencia de categoría a Gemini (falla suave → sin sugerencia)
 *  6. Inserta con confirmed=false
 *
 * `newerThanDays` normalmente no hace falta pasarlo (default 7, suficiente
 * para el uso diario). Sirve para un backfill puntual — p. ej. tras
 * corregir un bug de parseo o agregar soporte para un remitente que no se
 * estaba filtrando — llamando /api/sync?days=365 una sola vez.
 */
export async function runSync(newerThanDays?: number): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];

  const emails = await fetchQikEmails(newerThanDays);
  if (emails.length === 0) return { synced: 0, errors };

  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("gmail_message_id")
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

  const { data: categories, error: catError } = await supabase.from("categories").select("name");
  if (catError) throw new Error(`Error cargando categorías: ${catError.message}`);
  const categoryNames = (categories ?? []).map((c) => c.name);

  let synced = 0;
  for (const email of newEmails) {
    const parsed = parseQikEmail(email.subject, email.body);
    if (!parsed) {
      // Estados de cuenta, códigos CASH creados/vencidos, etc.: no son
      // transacciones y no representan un error de parseo.
      if (!isIgnorableQikEmail(email.subject, email.body)) {
        errors.push(`No se pudo parsear el correo ${email.id} ("${email.subject}")`);
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
      .eq("amount", parsed.amount)
      .eq("date", parsed.date.toISOString())
      .eq("type", parsed.type)
      .maybeSingle();
    if (dupError) throw new Error(`Error consultando duplicados: ${dupError.message}`);
    if (duplicate) continue;

    const suggestion = await suggestCategory({
      merchant: parsed.merchant,
      amount: parsed.amount,
      type: parsed.type,
      availableCategories: categoryNames,
    });

    const { error: insertError } = await supabase.from("transactions").insert({
      gmail_message_id: email.id,
      type: parsed.type,
      merchant: parsed.merchant,
      amount: parsed.amount,
      currency: parsed.currency,
      date: parsed.date.toISOString(),
      card_last4: parsed.card_last4,
      available_balance: parsed.available_balance,
      ai_suggested_category: suggestion?.category ?? null,
      confirmed: false,
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

  return { synced, errors };
}
