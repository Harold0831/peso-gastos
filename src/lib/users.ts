import "server-only";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "./supabase";
import { encryptToken } from "./crypto";
import { SESSION_COOKIE, readSessionUserId } from "./session";
import type { GoogleIdentity } from "./google-oauth";

export interface User {
  id: string;
  google_sub: string | null;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

/**
 * Busca o crea el usuario para una identidad de Google. El match es por
 * google_sub; si no existe, se intenta "reclamar" por email una fila
 * pre-creada sin sub (el usuario de Harold viene así de la migración 0003).
 */
export async function upsertUserFromGoogle(identity: GoogleIdentity): Promise<User> {
  const supabase = getSupabaseAdmin();

  const { data: bySub } = await supabase
    .from("users")
    .select("*")
    .eq("google_sub", identity.sub)
    .maybeSingle();
  if (bySub) {
    // Refresca nombre/avatar por si cambiaron en Google
    await supabase
      .from("users")
      .update({ name: identity.name, avatar_url: identity.picture, email: identity.email })
      .eq("id", bySub.id);
    return { ...bySub, name: identity.name, avatar_url: identity.picture };
  }

  const { data: byEmail } = await supabase
    .from("users")
    .select("*")
    .eq("email", identity.email)
    .maybeSingle();
  if (byEmail) {
    const { data: claimed, error } = await supabase
      .from("users")
      .update({ google_sub: identity.sub, name: identity.name, avatar_url: identity.picture })
      .eq("id", byEmail.id)
      .select("*")
      .single();
    if (error) throw new Error(`Error reclamando usuario: ${error.message}`);
    return claimed;
  }

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      google_sub: identity.sub,
      email: identity.email,
      name: identity.name,
      avatar_url: identity.picture,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Error creando usuario: ${error.message}`);
  return created;
}

/** Guarda (o actualiza) la cuenta de Gmail vinculada de un usuario. */
export async function saveGmailAccount(
  userId: string,
  email: string,
  refreshToken: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .upsert(
      {
        user_id: userId,
        email,
        refresh_token_enc: encryptToken(refreshToken),
        sync_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`Error guardando cuenta de Gmail: ${error.message}`);
}

export async function getUserById(id: string): Promise<User | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Error cargando usuario: ${error.message}`);
  return data;
}

export interface GmailStatus {
  linked: boolean;
  email: string | null;
  syncEnabled: boolean;
}

export async function getGmailStatus(userId: string): Promise<GmailStatus> {
  const { data, error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .select("email, sync_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Error cargando estado de Gmail: ${error.message}`);
  if (!data) return { linked: false, email: null, syncEnabled: false };
  return { linked: true, email: data.email, syncEnabled: data.sync_enabled };
}

/**
 * user_id de la sesión actual (server components / actions). Lanza si no
 * hay sesión válida — el middleware ya la exige, así que llegar aquí sin
 * sesión es un bug, no un caso esperado.
 */
export async function requireUserId(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = token ? await readSessionUserId(token) : null;
  if (!userId) throw new Error("Sin sesión activa");
  return userId;
}
