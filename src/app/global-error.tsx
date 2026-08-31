"use client";

import { useEffect } from "react";

/**
 * Último recurso: solo se activa si falla el propio layout raíz, en cuyo caso
 * Next.js lo REEMPLAZA por completo. Por eso monta su propio <html>/<body> y
 * usa estilos en línea: globals.css se importa en el layout que acaba de
 * fallar, así que aquí no se puede contar con Tailwind ni con las variables
 * de tema.
 *
 * En la práctica casi nunca se ve — los errores de pantalla los recoge
 * (app)/error.tsx, que sí conserva el diseño de la app.
 */
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
    <html lang="es">
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
          background: "#f5f5f7",
          color: "#16181d",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Peso no pudo cargar</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#61646b", margin: 0, maxWidth: 320 }}>
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
          <p style={{ fontSize: 11, color: "#61646b", margin: 0 }}>
            Código del error: {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
