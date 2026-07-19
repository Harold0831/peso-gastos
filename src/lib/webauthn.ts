import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

/**
 * Passkeys por usuario. Con multi-cuenta, el passkey ya no es el login
 * primario (eso es Google) — es la capa de re-bloqueo con Face ID
 * (AppLockGate): cada usuario puede registrar passkeys de sus dispositivos
 * y la app se los pide al volver de background o abrir desde cero.
 */

export interface StoredCredential {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: AuthenticatorTransportFuture[] | null;
}

export function getRpConfig(requestOrigin: string): { rpID: string; origin: string } {
  const url = new URL(requestOrigin);
  return { rpID: url.hostname, origin: url.origin };
}

export async function getCredentialsForUser(userId: string): Promise<StoredCredential[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("webauthn_credentials")
    .select("*")
    .eq("user_id", userId);
  if (error) throw new Error(`Error cargando credenciales: ${error.message}`);
  return data ?? [];
}

/** Solo devuelve la credencial si pertenece al usuario indicado. */
export async function getUserCredentialById(
  userId: string,
  id: string,
): Promise<StoredCredential | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("webauthn_credentials")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Error cargando credencial: ${error.message}`);
  return data;
}

export async function saveCredential(credential: StoredCredential): Promise<void> {
  const { error } = await getSupabaseAdmin().from("webauthn_credentials").insert(credential);
  if (error) throw new Error(`Error guardando credencial: ${error.message}`);
}

export async function updateCounter(id: string, counter: number): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("webauthn_credentials")
    .update({ counter })
    .eq("id", id);
  if (error) throw new Error(`Error actualizando counter: ${error.message}`);
}

/** Borra TODOS los passkeys del usuario — desactiva el bloqueo con Face ID. */
export async function deleteCredentialsForUser(userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("webauthn_credentials")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(`Error borrando credenciales: ${error.message}`);
}
