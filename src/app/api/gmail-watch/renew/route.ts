import { NextResponse, type NextRequest } from "next/server";
import { GmailAuthError, watchGmailMailbox } from "@/lib/gmail";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { decryptToken } from "@/lib/crypto";

export const maxDuration = 60;

/**
 * Renueva la suscripción de Gmail Push de TODOS los usuarios con Gmail
 * vinculado (cada watch expira a los 7 días máximo). Disparado 1x/día por
 * el cron de vercel.json — 1x/día es gratis en plan Hobby de Vercel.
 *
 * Usa CRON_SECRET (no SYNC_SECRET): Vercel solo inyecta automáticamente
 * el header "Authorization: Bearer $CRON_SECRET" en sus propios cron jobs
 * cuando la env var se llama exactamente así — es una convención de
 * Vercel, no configurable. SYNC_SECRET queda para /api/sync (llamadas
 * externas manuales, curl, atajos de iOS).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) {
    return NextResponse.json({ error: "Falta GMAIL_PUBSUB_TOPIC" }, { status: 503 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  const { data: accounts, error } = await supabase
    .from("gmail_accounts")
    .select("user_id, email, refresh_token_enc")
    .eq("sync_enabled", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const renewed: string[] = [];
  const errors: string[] = [];
  for (const account of accounts ?? []) {
    try {
      const result = await watchGmailMailbox(decryptToken(account.refresh_token_enc), topic);
      await supabase
        .from("gmail_accounts")
        .update({
          watch_expiration: new Date(Number(result.expiration)).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", account.user_id);
      renewed.push(account.email);
    } catch (err) {
      if (err instanceof GmailAuthError) {
        // Token revocado: apaga el sync de esa cuenta hasta que reconecte
        await supabase
          .from("gmail_accounts")
          .update({ sync_enabled: false })
          .eq("user_id", account.user_id);
        errors.push(`[${account.email}] acceso revocado — sync desactivado`);
      } else {
        errors.push(`[${account.email}] ${err instanceof Error ? err.message : "Error"}`);
      }
    }
  }

  return NextResponse.json({ renewed, errors });
}
