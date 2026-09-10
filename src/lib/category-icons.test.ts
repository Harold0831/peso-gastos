import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_ICON_KEYS, FALLBACK_CATEGORY_ICON, categoryIconKey } from "./category-icons";

/**
 * El catálogo de íconos vive en DOS sitios que no se hablan: el mapa de
 * `category-icons.ts` y el `case` de la migración 0016. Si divergen, el fallo
 * es silencioso y feo: la migración escribe una clave que el código no sabe
 * dibujar (categoría con ícono de repuesto sin motivo) o deja un emoji que el
 * código sí sabría traducir. Igual que con la paleta oscura (`theme.test.ts`),
 * lo que no se puede compartir se comprueba.
 */

const RAIZ = join(__dirname, "..", "..");
const MIGRACION = readFileSync(
  join(RAIZ, "supabase", "migrations", "0016_category_icon_keys.sql"),
  "utf8",
);
const SEED = readFileSync(join(RAIZ, "supabase", "seed.sql"), "utf8");

/** Los pares `when '🛒' then 'cart'` de la migración. */
function paresDeLaMigracion(): Map<string, string> {
  const pares = new Map<string, string>();
  for (const m of MIGRACION.matchAll(/when '([^']+)' then '([^']+)'/g)) {
    pares.set(m[1], m[2]);
  }
  return pares;
}

describe("categoryIconKey", () => {
  it("deja pasar una clave del catálogo", () => {
    expect(categoryIconKey("cart")).toBe("cart");
  });

  it("traduce los emoji que la app llegó a guardar", () => {
    // Las filas anteriores a la migración 0016 guardan el emoji.
    expect(categoryIconKey("🛒")).toBe("cart");
    expect(categoryIconKey("🎓")).toBe("book");
  });

  it("nunca deja una categoría sin ícono", () => {
    // Un emoji tecleado a mano en el campo libre que el selector tenía antes.
    expect(categoryIconKey("🦄")).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIconKey("")).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIconKey(null)).toBe(FALLBACK_CATEGORY_ICON);
    expect(categoryIconKey(undefined)).toBe(FALLBACK_CATEGORY_ICON);
  });
});

describe("el código y la migración 0016 no pueden divergir", () => {
  it("cada emoji que traduce la migración lo traduce igual el código", () => {
    const pares = paresDeLaMigracion();
    expect(pares.size).toBeGreaterThan(15); // el regex encontró algo de verdad

    for (const [emoji, clave] of pares) {
      expect(categoryIconKey(emoji), `la migración manda "${emoji}" a "${clave}"`).toBe(clave);
    }
  });

  it("la migración solo escribe claves que el código sabe dibujar", () => {
    // Cubre tanto el `case` de las personalizadas como los `set icon = '…'`
    // de las 9 globales.
    const escritas = [...MIGRACION.matchAll(/(?:then|set icon =) '([^']+)'/g)].map((m) => m[1]);
    expect(escritas.length).toBeGreaterThan(20);
    for (const clave of escritas) {
      expect(CATEGORY_ICON_KEYS, `la migración escribe "${clave}"`).toContain(clave);
    }
  });

  it("el seed no vuelve a meter emoji", () => {
    const iconos = [...SEED.matchAll(/\('[^']+', '([^']+)',/g)].map((m) => m[1]);
    expect(iconos).toHaveLength(9);
    for (const icono of iconos) {
      expect(CATEGORY_ICON_KEYS, `el seed usa "${icono}"`).toContain(icono);
    }
  });
});
