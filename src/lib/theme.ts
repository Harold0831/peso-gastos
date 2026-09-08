/**
 * Preferencia de tema del usuario. Vive solo en el cliente
 * (localStorage) — no es parte de la cuenta: un mismo usuario puede querer
 * la app clara en el iPhone y oscura en el escritorio.
 */
export type ThemePreference = "system" | "light" | "dark";

/** Tema efectivo, ya resuelto contra la preferencia del sistema. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "peso-theme";

/**
 * Color de la barra de estado (meta[name=theme-color]). Debe coincidir con
 * `--background` de cada tema en globals.css: es la franja que iOS pinta
 * sobre el notch en la PWA instalada, y un desajuste se ve como una banda
 * de otro color encima del contenido.
 */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#f5f5f7",
  dark: "#101114",
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Preferencia guardada → tema a pintar. `system` sigue al sistema
 * operativo; cualquier valor desconocido (o ausente) cae en `system`, que
 * es el default.
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "Sistema",
  light: "Claro",
  dark: "Oscuro",
};
