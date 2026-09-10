import "server-only";
import { getSupabaseAdmin } from "./supabase";
import { buildMerchantRules, matchesRule, type MerchantRule } from "./merchant-history";

/**
 * Lado servidor de la auto-confirmación: leer el historial del usuario, armar
 * sus reglas y decidir qué pendientes encajan.
 *
 * Vive aparte de `merchant-history.ts` (que es puro y con tests) y de
 * `sync.ts` porque hay DOS caminos que necesitan exactamente lo mismo:
 *  - el sync, que lo aplica a cada correo nuevo según entra.
 *  - la acción de ponerse al día (`autoConfirmPending`), que lo aplica de
 *    golpe a la cola que ya se acumuló — sin ella la función no serviría de
 *    nada a quien más la necesita: el que ya tiene 244 pendientes.
 *
 * Todas las consultas llevan el `user_id` explícito porque el sync corre
 * desde el webhook, SIN sesión: `requireUserId()` no tiene cookie que leer.
 */

/**
 * Tope de filas del historial que se leen para armar las reglas. Solo se
 * traen tres columnas pequeñas, pero alguien con años de uso no necesita
 * cargarlas todas para saber que Netflix es Entretenimiento.
 */
export const MERCHANT_HISTORY_LIMIT = 3000;

/** ¿Tiene este usuario la auto-confirmación encendida? Default: sí. */
export async function isAutoConfirmEnabled(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("auto_confirm_enabled")
    .eq("id", userId)
    .maybeSingle();
  return data?.auto_confirm_enabled !== false;
}

/**
 * Nombres de categorías que el usuario puede ELEGIR hoy: globales + propias,
 * menos las que ocultó (migración 0011).
 *
 * Auto-confirmar con una categoría que el usuario eliminó de su lista sería
 * resucitarla por la puerta de atrás, así que la regla solo vale si su
 * categoría sigue en esta lista.
 */
export async function visibleCategoryNames(userId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const [{ data: categories, error: catError }, { data: hidden, error: hiddenError }] =
    await Promise.all([
      supabase.from("categories").select("id, name").or(`user_id.is.null,user_id.eq.${userId}`),
      supabase.from("hidden_categories").select("category_id").eq("user_id", userId),
    ]);
  if (catError) throw new Error(`Error cargando categorías: ${catError.message}`);
  if (hiddenError) throw new Error(`Error cargando categorías ocultas: ${hiddenError.message}`);

  const hiddenIds = new Set((hidden ?? []).map((h) => h.category_id));
  return (categories ?? []).filter((c) => !hiddenIds.has(c.id)).map((c) => c.name as string);
}

/**
 * Reglas de auto-confirmación de un usuario, o un mapa vacío si las tiene
 * apagadas.
 *
 * Solo mira transacciones YA confirmadas: son las que representan una
 * decisión real del usuario. Fallo suave — si algo falla, mapa vacío y todo
 * entra como "por confirmar", el comportamiento de siempre. Nunca tumbar un
 * sync por una función que solo ahorra taps.
 */
export async function loadMerchantRules(userId: string): Promise<Map<string, MerchantRule>> {
  try {
    if (!(await isAutoConfirmEnabled(userId))) return new Map();

    const { data, error } = await getSupabaseAdmin()
      .from("transactions")
      .select("merchant, category, amount")
      .eq("user_id", userId)
      .eq("confirmed", true)
      .not("category", "is", null)
      .is("deleted_at", null)
      .limit(MERCHANT_HISTORY_LIMIT);
    if (error) throw new Error(error.message);

    return buildMerchantRules(
      (data ?? []).map((r) => ({
        merchant: r.merchant as string,
        category: r.category as string,
        amount: Number(r.amount),
      })),
    );
  } catch (err) {
    console.error("[loadMerchantRules] auto-confirmación desactivada esta corrida:", err);
    return new Map();
  }
}

export interface AutoConfirmable {
  id: string;
  category: string;
}

/**
 * Pendientes que encajan con un comercio que el usuario ya categorizó — lo
 * que la acción "ponerse al día" confirmaría.
 *
 * Se calcula en el servidor y no se le pide al cliente qué confirmar: una
 * server action es un endpoint público y la lista de ids/categorías que
 * mandara el navegador sería una orden, no un dato.
 */
export async function findAutoConfirmable(userId: string): Promise<AutoConfirmable[]> {
  const rules = await loadMerchantRules(userId);
  if (rules.size === 0) return [];

  const [names, { data, error }] = await Promise.all([
    visibleCategoryNames(userId),
    getSupabaseAdmin()
      .from("transactions")
      .select("id, merchant, amount")
      .eq("user_id", userId)
      .eq("confirmed", false)
      .is("deleted_at", null),
  ]);
  if (error) throw new Error(`Error consultando pendientes: ${error.message}`);

  const visible = new Set(names);
  const matches: AutoConfirmable[] = [];
  for (const row of data ?? []) {
    const match = matchesRule(
      { merchant: row.merchant as string, amount: Number(row.amount) },
      rules,
    );
    if (match && visible.has(match.category)) {
      matches.push({ id: row.id as string, category: match.category });
    }
  }
  return matches;
}
