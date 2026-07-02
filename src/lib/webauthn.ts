import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

export interface StoredCredential {
  id: string;
  public_key: string;
  counter: number;
  transports: AuthenticatorTransportFuture[] | null;
}

/** App de un solo usuario: identificador fijo para el user handle de WebAuthn. */
export const WEBAUTHN_USER = {
  id: "peso-harold",
  name: "harold3112@gmail.com",
  displayName: "Harold",
};

export function getRpConfig(requestOrigin: string): { rpID: string; origin: string } {
  const url = new URL(requestOrigin);
  return { rpID: url.hostname, origin: url.origin };
}

export async function getCredentials(): Promise<StoredCredential[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getSupabaseAdmin().from("webauthn_credentials").select("*");
  if (error) throw new Error(`Error cargando credenciales: ${error.message}`);
  return data ?? [];
}

export async function getCredentialById(id: string): Promise<StoredCredential | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("webauthn_credentials")
    .select("*")
    .eq("id", id)
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
