import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  cancelado: "Cancelaste el inicio de sesión. Inténtalo de nuevo cuando quieras.",
  estado_invalido: "La sesión de login expiró. Inténtalo de nuevo.",
  error_interno: "Algo salió mal al iniciar sesión. Inténtalo de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.error_interno) : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 pb-safe">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-2xl font-extrabold text-white shadow-card">
          P
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">Peso</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Tus gastos e ingresos, importados solos desde tu correo.
        </p>

        <Link
          href="/api/auth/google"
          className="mt-10 flex w-full items-center justify-center gap-3 rounded-btn border border-line bg-surface px-6 py-4 text-[15px] font-bold text-ink shadow-card transition active:scale-[0.98]"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          Continuar con Google
        </Link>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Google te preguntará si permites leer tu correo — es lo que usa Peso para importar tus
          transacciones de Qik automáticamente. Puedes omitirlo y registrar todo a mano.
        </p>

        {message && <p className="mt-4 text-sm font-medium text-expense">{message}</p>}
      </div>
    </main>
  );
}
