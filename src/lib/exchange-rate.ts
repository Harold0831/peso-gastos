import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

/**
 * Tasa de cambio USD→DOP con cache diaria en la tabla exchange_rates
 * (migración 0004). Una sola consulta externa por día para toda la app:
 * el primer sync (o alta manual en USD) del día la busca y la cachea;
 * el resto del día se lee de la tabla.
 *
 * Proveedores, en orden:
 *  1. BCRD (Banco Central) — PENDIENTE (issue #1): su API requiere
 *     registrarse en apibcrd.bancentral.gov.do para obtener una key, y el
 *     formato del endpoint hay que verificarlo contra su Swagger real
 *     (no adivinar el formato — misma lección que los parsers de banco).
 *     Cuando exista, va como primer elemento de PROVIDERS.
 *  2. open.er-api.com (ExchangeRate-API, plan abierto) — sin key, tasa
 *     mid-market. Aproximación razonable a lo que cobra Visa/Mastercard.
 *
 * Fallo suave en todo el módulo (mismo patrón que gemini.ts): si no hay
 * tasa disponible, se devuelve null y quien llama decide el fallback —
 * el sync nunca se cae por esto.
 */

/** Tasa usada en modo demo (sin Supabase) para que la UI sea navegable. */
export const DEMO_RATE = 61.25;

interface RateProvider {
  source: string;
  fetchRate: () => Promise<number | null>;
}

/** Extrae la tasa DOP de una respuesta de open.er-api.com. Exportada para tests. */
export function parseErApiResponse(payload: unknown): number | null {
  if (typeof payload !== "object" || payload === null) return null;
  const data = payload as { result?: string; rates?: Record<string, unknown> };
  if (data.result !== "success") return null;
  const rate = data.rates?.DOP;
  return typeof rate === "number" && rate > 0 ? rate : null;
}

const PROVIDERS: RateProvider[] = [
  // TODO(issue #1): proveedor BCRD primero, cuando haya key y docs reales.
  {
    source: "er-api",
    fetchRate: async () => {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      return parseErApiResponse(await res.json());
    },
  },
];

/** Día actual en hora de República Dominicana (AST, UTC-4 fijo). */
function todayInSantoDomingo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santo_Domingo",
  }).format(new Date());
}

/**
 * Tasa USD→DOP de hoy. Lee la cache; si no existe, consulta los
 * proveedores en orden y cachea el primero que responda. Devuelve null
 * si todos fallan y no hay nada cacheado hoy.
 */
export async function getUsdToDopRate(): Promise<number | null> {
  if (!isSupabaseConfigured()) return DEMO_RATE;

  const supabase = getSupabaseAdmin();
  const today = todayInSantoDomingo();

  const { data: cached } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("day", today)
    .maybeSingle();
  if (cached) return Number(cached.rate);

  for (const provider of PROVIDERS) {
    let rate: number | null = null;
    try {
      rate = await provider.fetchRate();
    } catch {
      continue; // red caída, timeout, JSON inválido: prueba el siguiente
    }
    if (rate === null) continue;

    // upsert: dos syncs simultáneos pueden llegar aquí a la vez y no importa
    // quién gane — es la misma tasa del mismo día.
    await supabase
      .from("exchange_rates")
      .upsert({ day: today, rate, source: provider.source }, { onConflict: "day" });
    return rate;
  }
  return null;
}

/**
 * Última tasa cacheada, de cualquier día. Nunca toca la red — es el
 * fallback barato para la capa de lectura (data.ts) cuando una transacción
 * USD vieja no tiene exchange_rate propio (anteriores a la migración 0004).
 */
export async function getLatestCachedRate(): Promise<number | null> {
  if (!isSupabaseConfigured()) return DEMO_RATE;
  const { data } = await getSupabaseAdmin()
    .from("exchange_rates")
    .select("rate")
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.rate) : null;
}
