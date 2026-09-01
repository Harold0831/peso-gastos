import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Todo el acceso a datos ocurre en el SERVIDOR (server components, server
 * actions y route handlers) detrás del middleware de sesión. Por eso se usa
 * la service role key directamente y las tablas tienen RLS activo sin
 * policies: la anon key no puede tocar nada y el navegador nunca habla con
 * Supabase.
 *
 * OJO — la contrapartida: la service role key **ignora el RLS**, así que en
 * una app multi-usuario como esta el aislamiento entre usuarios NO lo aplica
 * la base de datos, sino el código. Cada consulta debe filtrar por el
 * `user_id` de `requireUserId()`; olvidarlo en una sola le enseña (o le
 * borra) datos de una persona a otra. `data-isolation.test.ts` y
 * `actions-isolation.test.ts` son la red que caza ese descuido: recorren
 * todas las lecturas y mutaciones y fallan si alguna no está acotada.
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
