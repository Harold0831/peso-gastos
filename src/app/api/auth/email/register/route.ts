import { NextResponse, type NextRequest } from "next/server";
import { registerSchema } from "@/lib/schemas";
import { hashPassword } from "@/lib/password";
import { createUserWithPassword } from "@/lib/users";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

/**
 * Alta de cuenta con correo y contraseña. Deja la sesión iniciada, igual
 * que el callback de Google.
 *
 * Si el correo ya existe se rechaza en vez de "adoptar" esa cuenta: sin
 * verificar el correo, poner contraseña sobre una cuenta ajena sería un
 * secuestro. Quien ya entró con Google y quiere contraseña la fija desde su
 * perfil (con la sesión abierta, que prueba que la cuenta es suya).
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "La app está en modo demo." }, { status: 503 });
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const user = await createUserWithPassword(
      parsed.data.email,
      parsed.data.name,
      await hashPassword(parsed.data.password),
    );
    if (!user) {
      return NextResponse.json(
        {
          error:
            "Ya existe una cuenta con ese correo. Entra con Google y, si quieres, agrega una contraseña desde tu perfil.",
        },
        { status: 409 },
      );
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
    return response;
  } catch (err) {
    console.error("[auth/email/register]", err);
    return NextResponse.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }
}
