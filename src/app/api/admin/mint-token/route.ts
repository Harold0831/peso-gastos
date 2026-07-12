import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { mintTokenForUser } from "@/lib/api-token";
import { getUserByEmail, setHomeCurrencyForUser } from "@/lib/users";
import { isSupabaseConfigured } from "@/lib/supabase";
import { mintTokenSchema } from "@/lib/schemas";

/**
 * Genera (o rota) el token de API de un usuario. Protegido por
 * "Authorization: Bearer $ADMIN_SECRET" — es una operación de administración
 * que Harold corre una vez desde su teléfono/curl para copiar el token al
 * Shortcut. El usuario ya debe existir (haber entrado a la app al menos una
 * vez). Opcionalmente fija su moneda de casa (ej. EUR).
 *
 * El token se devuelve UNA sola vez en texto plano; en la DB solo queda su
 * hash. Si se pierde, se vuelve a mintear (invalida el anterior).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET no configurado" }, { status: 503 });
  }
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!constantTimeEqual(provided, secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = mintTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const user = await getUserByEmail(parsed.data.email);
  if (!user) {
    return NextResponse.json(
      { error: "No existe un usuario con ese email — que entre a la app primero" },
      { status: 404 },
    );
  }

  if (parsed.data.home_currency) {
    await setHomeCurrencyForUser(user.id, parsed.data.home_currency);
  }
  const token = await mintTokenForUser(user.id, "iOS Shortcut");

  return NextResponse.json({
    ok: true,
    email: user.email,
    home_currency: parsed.data.home_currency ?? null,
    token,
  });
}

/** Comparación en tiempo constante que no filtra longitud por early-return. */
function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
