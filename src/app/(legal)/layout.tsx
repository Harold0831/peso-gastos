import Link from "next/link";

/**
 * Layout de las páginas legales (/privacy, /terms). Van fuera del grupo
 * (app) a propósito: no llevan BottomNav ni sesión, y el middleware las deja
 * públicas — Google EXIGE que la URL de la política de privacidad sea
 * accesible sin iniciar sesión para verificar el scope gmail.readonly.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background pt-safe pb-safe">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        <Link href="/" className="text-[13px] font-semibold text-accent">
          ← Volver a Peso
        </Link>
        <article className="legal mt-6">{children}</article>
        <nav className="mt-12 flex gap-4 border-t border-line pt-6 text-[13px] text-ink-muted">
          <Link href="/privacy" className="font-semibold text-accent">
            Privacidad
          </Link>
          <Link href="/terms" className="font-semibold text-accent">
            Términos
          </Link>
        </nav>
      </div>
    </main>
  );
}
