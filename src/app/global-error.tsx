"use client";

import { useEffect } from "react";
import { ThemeScript } from "@/components/theme-script";

/**
 * Último recurso: solo se activa si falla el propio layout raíz, en cuyo caso
 * Next.js lo REEMPLAZA por completo. Por eso monta su propio <html>/<body> y
 * usa estilos en línea: globals.css se importa en el layout que acaba de
 * fallar, así que aquí no se puede contar con Tailwind ni con las variables
 * de tema.
 *
 * Como no hay globals.css, esta pantalla trae su propia mini-paleta (--ge-*)
 * con los mismos valores de los dos temas. Reusa ThemeScript para respetar la
 * preferencia guardada: sin él, alguien con la app en oscuro recibiría un
 * flashazo blanco justo en el peor momento.
 *
 * En la práctica casi nunca se ve — los errores de pantalla los recoge
 * (app)/error.tsx, que sí conserva el diseño de la app.
 */
const PALETTE = `
:root { --ge-bg:#f5f5f7; --ge-fg:#16181d; --ge-muted:#61646b; color-scheme:light; }
@media (prefers-color-scheme: dark) {
  :root:not(.light) { --ge-bg:#101114; --ge-fg:#e8eaf0; --ge-muted:#9195a1; color-scheme:dark; }
}
.dark { --ge-bg:#101114; --ge-fg:#e8eaf0; --ge-muted:#9195a1; color-scheme:dark; }
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error.digest ?? "(sin digest)", error);
  }, [error]);

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: PALETTE }} />
        <ThemeScript />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "0 32px",
          textAlign: "center",
          background: "var(--ge-bg)",
          color: "var(--ge-fg)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Peso no pudo cargar</h1>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--ge-muted)",
            margin: 0,
            maxWidth: 320,
          }}
        >
          Ocurrió un problema inesperado. Vuelve a intentarlo en un momento — tus datos están a
          salvo.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            padding: "14px 28px",
            fontSize: 15,
            fontWeight: 700,
            color: "#fff",
            background: "#2563eb",
            border: "none",
            borderRadius: 14,
          }}
        >
          Reintentar
        </button>
        {error.digest && (
          <p style={{ fontSize: 11, color: "var(--ge-muted)", margin: 0 }}>
            Código del error: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
