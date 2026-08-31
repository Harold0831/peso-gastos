import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "@/lib/schemas";
import { verifyPassword } from "@/lib/password";
import { clearFailedLogins, getPasswordAccount, registerFailedLogin } from "@/lib/users";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";
import { AUTH_LIMITS, RATE_LIMITED_MESSAGE, checkRateLimit, clientIp } from "@/lib/rate-limit";

/** Mismo mensaje para "no existe" y "contraseña mala": decir cuál de los dos
 *  falló le confirmaría a un atacante qué correos tienen cuenta. */
const GENERIC_ERROR = "Correo o contraseña incorrectos.";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "La app está en modo demo." }, { status: 503 });
  }

  // Límite por IP, ANTES de tocar la base o gastar un scrypt. El freno de
  // failed_login_attempts es por cuenta: no ve nada si el atacante prueba una
  // contraseña común contra mil correos distintos.
  const allowed = await checkRateLimit(
    `login:${clientIp(request)}`,
    AUTH_LIMITS.login.limit,
    AUTH_LIMITS.login.windowSeconds,
  );
  if (!allowed) {
    return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
  }

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const account = await getPasswordAccount(parsed.data.email);

    // Cuenta inexistente, o existente pero solo de Google (sin contraseña).
    // En ambos casos la respuesta es la genérica.
    if (!account?.passwordHash) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) {
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo." },
        { status: 429 },
      );
    }

    if (!(await verifyPassword(parsed.data.password, account.passwordHash))) {
      // Si el bloqueo ya venció, el contador arranca de cero otra vez.
      const expired = account.lockedUntil && new Date(account.lockedUntil) <= new Date();
      await registerFailedLogin(account.id, expired ? 0 : account.failedAttempts);
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    if (account.failedAttempts > 0 || account.lockedUntil) {
      await clearFailedLogins(account.id);
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(account.id),
      sessionCookieOptions,
    );
    return response;
  } catch (err) {
    console.error("[auth/email/login]", err);
    return NextResponse.json({ error: "No se pudo iniciar sesión." }, { status: 500 });
  }
}
