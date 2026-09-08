"use client";

import { useEffect, useState } from "react";
import {
  THEME_COLOR,
  THEME_LABELS,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS: ThemePreference[] = ["system", "light", "dark"];

/**
 * Aplica la preferencia al documento. Es la MISMA lógica que ThemeScript
 * ejecuta antes del primer paint; aquí corre al cambiar de opción para que
 * el tema salte al instante sin recargar.
 */
function applyTheme(preference: ThemePreference) {
  const dark = resolveTheme(preference, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", preference === "dark");
  root.classList.toggle("light", preference === "light");
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta) meta.content = THEME_COLOR[dark];
}

export function ThemeToggle() {
  // Arranca en "system" (el default) y se corrige tras montar: localStorage
  // no existe en el render del servidor, y leerlo durante el render daría un
  // desajuste de hidratación.
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemePreference(stored)) setPreference(stored);
    } catch {
      // Safari en modo privado puede lanzar al leer localStorage.
    }
  }, []);

  // En "Sistema" hay que repintar cuando el SO cambia de tema (el modo
  // automático de iOS al anochecer, sin tocar la app).
  useEffect(() => {
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  function choose(next: ThemePreference) {
    setPreference(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Sin persistencia el tema igual se aplica en esta sesión.
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="mt-3 flex rounded-btn border border-line bg-surface p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={preference === option}
          onClick={() => choose(option)}
          className={`flex-1 rounded-[9px] py-2.5 text-[13px] font-bold transition ${
            preference === option ? "bg-accent-solid text-white" : "text-ink-muted"
          }`}
        >
          {THEME_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
