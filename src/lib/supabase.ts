import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Peso es una app de un solo usuario: todo el acceso a datos ocurre en el
 * servidor (server components, server actions y route handlers) detrás del
 * middleware de sesión. Por eso se usa la service role key directamente y
 * las tablas tienen RLS activo sin policies — la anon key no puede tocar nada.
 */

let cached: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!cached) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase no está configurado: define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY",
      );
    }
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
