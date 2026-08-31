import Link from "next/link";

/**
 * 404. Se ve sobre todo al abrir un enlace viejo o al escribir una ruta a
 * mano; quien no tiene sesión ni llega aquí, porque el middleware lo manda
 * antes a /login.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <p className="text-3xl">🧭</p>
      <h1 className="mt-3 text-[17px] font-bold tracking-tight text-ink">Esta página no existe</h1>
      <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-muted">
        Puede que el enlace esté viejo o que la dirección tenga un error.
      </p>
      <Link
        href="/"
        className="mt-6 w-full max-w-xs rounded-btn bg-accent py-3.5 text-[15px] font-bold text-white shadow-card transition active:scale-[0.98]"
      >
        Ir al inicio
      </Link>
    </main>
  );
}
