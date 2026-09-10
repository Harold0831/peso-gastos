/**
 * Catálogo de íconos de categoría — solo las CLAVES, sin dibujos.
 *
 * Vive separado de `components/category-icons.tsx` por la misma razón que
 * `banks.ts` vive separado de `bank-parser.ts`: los schemas de Zod y las
 * server actions necesitan validar la clave, y no tienen por qué arrastrar
 * componentes de React (ni el JSX de 18 SVG) a su bundle. El archivo de
 * componentes importa de aquí, nunca al revés.
 */

/**
 * Claves válidas, en el orden en que las muestra el selector: primero las que
 * usan las categorías por defecto, después las del resto.
 */
export const CATEGORY_ICON_KEYS = [
  "cart",
  "food",
  "car",
  "health",
  "play",
  "receipt",
  "bag",
  "transfer",
  "book",
  "home",
  "coffee",
  "gift",
  "flight",
  "fitness",
  "game",
  "pet",
  "money",
  "tag",
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

/** Clave de repuesto: nunca dejar una categoría sin ícono. */
export const FALLBACK_CATEGORY_ICON: CategoryIconKey = "tag";

/**
 * Emoji que la app llegó a guardar (el seed original y los `EMOJI_PRESETS` del
 * selector viejo) → su clave equivalente.
 *
 * La migración 0016 reescribe las filas existentes, así que en teoría esto
 * sobra. Existe para lo que la migración no alcanza: una categoría creada
 * entre el deploy y la corrida de la migración, un backup viejo restaurado, o
 * un emoji tecleado a mano en el campo libre que el selector tenía antes.
 * Debe seguir coincidiendo con el `case` de esa migración.
 */
const LEGACY_EMOJI: Record<string, CategoryIconKey> = {
  "🛒": "cart",
  "🚗": "car",
  "💊": "health",
  "🎬": "play",
  "📄": "receipt",
  "🛍️": "bag",
  "🛍": "bag",
  "🔁": "transfer",
  "📚": "book",
  "🎓": "book",
  "📌": "tag",
  "🏷️": "tag",
  "🏷": "tag",
  "🐶": "pet",
  "🏋️": "fitness",
  "🏋": "fitness",
  "☕": "coffee",
  "🎁": "gift",
  "✈️": "flight",
  "✈": "flight",
  "🍔": "food",
  "💅": "gift",
  "🎮": "game",
  "🏠": "home",
  "👶": "pet",
  "💰": "money",
};

const KEYS = new Set<string>(CATEGORY_ICON_KEYS);

/** Valor guardado (clave nueva o emoji viejo) → clave del catálogo. */
export function categoryIconKey(stored: string | null | undefined): CategoryIconKey {
  if (!stored) return FALLBACK_CATEGORY_ICON;
  if (KEYS.has(stored)) return stored as CategoryIconKey;
  return LEGACY_EMOJI[stored] ?? FALLBACK_CATEGORY_ICON;
}
