import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, hasGmailScope, verifyIdToken } from "@/lib/google-oauth";
import { saveGmailAccount, upsertUserFromGoogle } from "@/lib/users";
import { watchGmailMailbox } from "@/lib/gmail";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runSyncForUser } from "@/lib/sync";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

/**
 * Callback del OAuth de Google. Crea/encuentra el usuario, guarda el
 * refresh token de Gmail si el usuario concedió el scope (es un checkbox
 * opcional en el consent — sin él, la cuenta funciona en modo manual), y
 * emite la sesión.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const loginError = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  const errorParam = request.nextUrl.searchParams.get("error");
  if (errorParam) {
    // El usuario canceló el consent — no es un error de la app
    return loginError(errorParam === "access_denied" ? "cancelado" : errorParam);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return loginError("estado_invalido");
  }

  try {
    const tokens = await exchangeCode(origin, code);
    const identity = await verifyIdToken(tokens.id_token);
    const user = await upsertUserFromGoogle(identity);

    if (tokens.refresh_token && hasGmailScope(tokens.scope)) {
      await saveGmailAccount(user.id, identity.email, tokens.refresh_token);

      // Best-effort: activa el push y corre el primer sync de inmediato,
      // sin bloquear el login si algo falla (el cron diario y el botón
      // manual quedan de respaldo).
      const topic = process.env.GMAIL_PUBSUB_TOPIC;
      if (topic) {
        try {
          const watch = await watchGmailMailbox(tokens.refresh_token, topic);
          await getSupabaseAdmin()
            .from("gmail_accounts")
            .update({ watch_expiration: new Date(Number(watch.expiration)).toISOString() })
            .eq("user_id", user.id);
        } catch (err) {
          console.error("No se pudo activar el watch de Gmail:", err);
        }
      }
      try {
        await runSyncForUser(user.id);
      } catch (err) {
        console.error("Primer sync falló:", err);
      }
    }

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("Error en callback de Google:", err);
    return loginError("error_interno");
  }
}
