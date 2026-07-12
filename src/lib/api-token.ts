import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";

/**
 * Tokens de API para escritura sin sesión interactiva — el caso de uso es
 * un Shortcut de iOS que registra gastos y no puede hacer el flujo OAuth
 * de Google. El token es un secreto largo y aleatorio que vive en el
 * Shortcut; en la DB solo se guarda su hash SHA-256 (tabla api_tokens),
 * así un dump de la base no filtra credenciales usables.
 *
 * El blast radius de un token filtrado es bajo: los endpoints que lo
 * aceptan solo INSERTAN transacciones del usuario dueño — no leen ni
 * borran nada.
 */

/** Genera un token nuevo (48 bytes → 64 chars base64url). Solo se ve una vez. */
export function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

/** Hash determinístico para guardar/buscar. El token nunca se guarda crudo. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Crea (o reemplaza) el token del usuario y devuelve el token en claro —
 * es la ÚNICA vez que se puede leer. Un usuario tiene un token a la vez:
 * mintear de nuevo invalida el anterior.
 */
export async function mintTokenForUser(userId: string, name?: string): Promise<string> {
  const token = generateToken();
  const supabase = getSupabaseAdmin();
  await supabase.from("api_tokens").delete().eq("user_id", userId);
  const { error } = await supabase.from("api_tokens").insert({
    user_id: userId,
    token_hash: hashToken(token),
    name: name ?? null,
  });
  if (error) throw new Error(`Error creando token: ${error.message}`);
  return token;
}

/**
 * Resuelve el user_id dueño de un token (o null si no existe). Busca por
 * hash — el token en sí es de alta entropía, así que no hay vector de
 * fuerza bruta práctico. Actualiza last_used_at de forma best-effort.
 */
export async function resolveUserIdFromToken(token: string): Promise<string | null> {
  if (!token) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("api_tokens")
    .select("id, user_id")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error || !data) return null;

  // No bloquea la request si falla el touch de la marca de uso.
  await supabase
    .from("api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return data.user_id;
}
