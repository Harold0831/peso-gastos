import "server-only";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "./supabase";
import { encryptToken } from "./crypto";
import { SESSION_COOKIE, readSessionUserId } from "./session";
import type { GoogleIdentity } from "./google-oauth";
import type { Currency } from "./types";

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

/** Busca un usuario por email (endpoint admin de minting de tokens). */
export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Error buscando usuario: ${error.message}`);
  return data;
}

/**
 * Crea una cuenta con correo y contraseña. Devuelve null si el correo ya
 * existe: NO se le pone contraseña a una cuenta ajena que ya está creada
 * (sería un secuestro — cualquiera que sepa tu correo entraría). Para
 * añadirle contraseña a una cuenta de Google existente está `setPassword`,
 * que exige tener la sesión abierta.
 */
export async function createUserWithPassword(
  email: string,
  name: string,
  passwordHash: string,
): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  const normalized = email.toLowerCase();

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (existing) return null;

  const { data: created, error } = await supabase
    .from("users")
    .insert({ email: normalized, name, password_hash: passwordHash })
    .select("*")
    .single();
  // 23505 = carrera con otro registro simultáneo del mismo correo
  if (error?.code === "23505") return null;
  if (error) throw new Error(`Error creando usuario: ${error.message}`);
  return created;
}

export interface PasswordAccount {
  id: string;
  passwordHash: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
}

/** Datos de login por contraseña de un correo (null si no existe la cuenta). */
export async function getPasswordAccount(email: string): Promise<PasswordAccount | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, password_hash, failed_login_attempts, locked_until")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Error buscando usuario: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id,
    passwordHash: data.password_hash,
    failedAttempts: data.failed_login_attempts ?? 0,
    lockedUntil: data.locked_until,
  };
}

/** Freno de fuerza bruta: tras MAX_ATTEMPTS fallos seguidos, bloquea un rato. */
export const MAX_LOGIN_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

export async function registerFailedLogin(userId: string, currentAttempts: number): Promise<void> {
  const attempts = currentAttempts + 1;
  const lockedUntil =
    attempts >= MAX_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
      : null;
  await getSupabaseAdmin()
    .from("users")
    .update({ failed_login_attempts: attempts, locked_until: lockedUntil })
    .eq("id", userId);
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await getSupabaseAdmin()
    .from("users")
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq("id", userId);
}

/** ¿Este usuario tiene contraseña configurada? (para la UI del perfil). */
export async function hasPassword(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("password_hash")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(data?.password_hash);
}

/** Guarda el hash de la contraseña de un usuario ya autenticado. */
export async function savePasswordHash(userId: string, passwordHash: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({ password_hash: passwordHash, failed_login_attempts: 0, locked_until: null })
    .eq("id", userId);
  if (error) throw new Error(`Error guardando la contraseña: ${error.message}`);
}

/** Moneda de casa de un usuario (en la que ve sus totales). Default DOP. */
export async function getHomeCurrencyForUser(userId: string): Promise<Currency> {
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("home_currency")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Error cargando moneda de casa: ${error.message}`);
  return (data?.home_currency as Currency) ?? "DOP";
}

/** Fija la moneda de casa de un usuario (endpoint admin). */
export async function setHomeCurrencyForUser(userId: string, currency: Currency): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({ home_currency: currency })
    .eq("id", userId);
  if (error) throw new Error(`Error guardando moneda de casa: ${error.message}`);
}

export interface GmailStatus {
  linked: boolean;
  email: string | null;
  syncEnabled: boolean;
  /** Ids de bank-parser.ts elegidos por el usuario; null = todos. */
  enabledBanks: string[] | null;
}

export async function getGmailStatus(userId: string): Promise<GmailStatus> {
  const { data, error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .select("email, sync_enabled, enabled_banks")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Error cargando estado de Gmail: ${error.message}`);
  if (!data) return { linked: false, email: null, syncEnabled: false, enabledBanks: null };
  return {
    linked: true,
    email: data.email,
    syncEnabled: data.sync_enabled,
    enabledBanks: data.enabled_banks,
  };
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
