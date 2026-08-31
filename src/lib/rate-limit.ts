import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

/**
 * Rate limiting por clave, respaldado por la tabla `rate_limits`
 * (migración 0014). El contador vive en Postgres y no en memoria porque la
 * app corre en funciones serverless: cada petición puede caer en una
 * instancia distinta, y un Map en memoria no contaría nada útil.
 */

/**
 * IP del cliente de una petición entrante.
 *
 * `x-real-ip` va primero porque en Vercel lo pone la plataforma. En
 * `x-forwarded-for` se usa la ÚLTIMA entrada, no la primera: cada proxy
 * añade la IP que vio, así que la de la derecha es la que puso el proxy de
 * confianza — la de la izquierda puede haberla escrito el propio cliente.
 *
 * Un atacante que falsee la cabecera solo consigue fragmentar SU propio
 * contador, no leer ni subir el de otro. Sin ninguna IP (dev local) se
 * devuelve "desconocida", que agrupa todo bajo una sola clave: para
 * desarrollo es lo correcto y en producción no ocurre.
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "desconocida";
}

/**
 * Registra un intento para `key` y devuelve true si se permite.
 *
 * **Falla ABIERTO**: si Supabase no responde, deja pasar la petición y lo
 * loguea. Es deliberado — fallar cerrado convertiría cualquier hipo de la
 * base de datos en "nadie puede entrar a la app", que es un problema peor
 * que el que esto previene. Detrás sigue habiendo credenciales que acertar.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;

  try {
    const { data, error } = await getSupabaseAdmin().rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[checkRateLimit]", key, error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error("[checkRateLimit] Excepción:", key, err);
    return true;
  }
}

/**
 * Límites de los endpoints de autenticación. Son generosos para una persona
 * real (nadie crea 5 cuentas en una hora ni falla 20 veces al entrar en 15
 * minutos) y estrechos para un script.
 */
export const AUTH_LIMITS = {
  /** Alta de cuenta: cada intento cuesta un scrypt (~96 MB). */
  register: { limit: 5, windowSeconds: 3600 },
  /**
   * Entrada: complementa el freno por cuenta (failed_login_attempts), que no
   * ve nada si el atacante prueba una contraseña contra mil correos distintos.
   */
  login: { limit: 20, windowSeconds: 900 },
  /** Cambio de contraseña desde el perfil (ya requiere sesión). */
  setPassword: { limit: 10, windowSeconds: 3600 },
} as const;

/** Mensaje único para los 429, en español y sin filtrar cuánto falta. */
export const RATE_LIMITED_MESSAGE =
  "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
