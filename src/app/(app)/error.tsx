"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary de las pantallas de la app.
 *
 * Sin esto, cualquier `throw` de un server component (data.ts lanza cuando
 * Supabase falla) llegaba al usuario como la pantalla gris por defecto de
 * Next.js: "Application error: a server-side exception has occurred", en
 * inglés y sin ninguna acción posible. Toda la app cuida los errores de
 * MUTACIÓN (friendlyDbError + toasts) y dejaba las LECTURAS al descubierto.
 *
 * `reset()` reintenta el render del segmento — que es justo lo que hace falta
 * cuando el fallo fue un hipo de red o de la base de datos.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Va a los logs de Vercel. `digest` es el id que Next.js asigna al error
    // del servidor: es lo único que permite atar lo que ve el usuario con el
    // stack real, que nunca se le manda al navegador.
    console.error("[app/error]", error.digest ?? "(sin digest)", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 pb-24 text-center">
      <p className="text-3xl">😕</p>
      <h1 className="mt-3 text-[17px] font-bold tracking-tight text-ink">
        Algo salió mal al cargar esto
      </h1>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-muted">
        No pudimos traer tus datos. Suele ser algo momentáneo — vuelve a intentarlo. Tus
        transacciones están a salvo.
      </p>

      <button
        onClick={reset}
        className="mt-6 w-full max-w-xs rounded-btn bg-accent py-3.5 text-[15px] font-bold text-white shadow-card transition active:scale-[0.98]"
      >
        Reintentar
      </button>
      <Link href="/" className="mt-3 py-2 text-[13px] font-semibold text-ink-muted">
        Ir al inicio
      </Link>

      {error.digest && (
        <p className="mt-6 text-[11px] text-ink-muted">
          Código del error: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
