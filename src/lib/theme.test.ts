import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme, THEME_COLOR } from "./theme";

describe("resolveTheme", () => {
  it("sigue al sistema en 'system'", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("ignora al sistema cuando el usuario fuerza un tema", () => {
    // Este es el caso que obliga a la clase .light: sistema en oscuro pero el
    // usuario quiere la app clara.
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("isThemePreference", () => {
  it("acepta los tres valores válidos", () => {
    expect(["system", "light", "dark"].every(isThemePreference)).toBe(true);
  });

  it("rechaza basura de localStorage", () => {
    // localStorage devuelve null si no hay nada, y puede tener un valor viejo
    // de otra versión de la app.
    for (const value of [null, undefined, "", "Dark", "auto", 1, {}]) {
      expect(isThemePreference(value)).toBe(false);
    }
  });
});

/**
 * globals.css declara la paleta oscura DOS veces (media query para el modo
 * automático, clase .dark para el forzado) porque CSS no permite compartir un
 * bloque entre ambas condiciones. Si se desincronizan, la app se ve distinta
 * según CÓMO llegaste al modo oscuro — un bug silencioso y muy molesto de
 * diagnosticar. Estos tests son lo único que lo impide.
 */
describe("paleta de globals.css", () => {
  const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

  /** Extrae las declaraciones `--var: valor;` de un bloque `selector { … }`. */
  function tokensOf(blockStart: string): Record<string, string> {
    const at = css.indexOf(blockStart);
    expect(at, `no se encontró el bloque ${blockStart}`).toBeGreaterThan(-1);
    const body = css.slice(at + blockStart.length, css.indexOf("}", at));
    const tokens: Record<string, string> = {};
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      tokens[name] = value.trim();
    }
    return tokens;
  }

  const light = tokensOf(":root {");
  const darkAuto = tokensOf(":root:not(.light) {");
  const darkForced = tokensOf(".dark {");

  it("declara los mismos tokens en los dos bloques oscuros", () => {
    expect(Object.keys(darkForced).sort()).toEqual(Object.keys(darkAuto).sort());
  });

  it("les da los mismos valores", () => {
    expect(darkForced).toEqual(darkAuto);
  });

  it("no deja ningún token del tema claro sin contraparte oscura", () => {
    // Un token nuevo que solo exista en :root se quedaría con el valor claro
    // en modo oscuro. Los tipográficos y de forma (radios, fuentes) no cuentan:
    // no dependen del tema.
    const themed = Object.keys(light).filter((t) => t !== "color-scheme");
    expect(themed.filter((t) => !(t in darkForced))).toEqual([]);
  });

  it("usa el mismo --background que THEME_COLOR de la barra de estado", () => {
    // Si divergen, iOS pinta una franja de otro color sobre el notch.
    expect(light["--background"]).toBe(THEME_COLOR.light);
    expect(darkForced["--background"]).toBe(THEME_COLOR.dark);
  });
});
