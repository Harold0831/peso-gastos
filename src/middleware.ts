import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Protege todas las rutas excepto /login, las rutas de auth, /api/sync
 * (protegida por su propio Bearer SYNC_SECRET) y los assets de la PWA.
 *
 * En dev sin Supabase configurado se deja pasar todo: no hay dónde guardar
 * credenciales de passkey, así que la app corre abierta con datos mock.
 */

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/sync"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  if (!supabaseConfigured) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Excluye estáticos de Next, el service worker, manifest e íconos.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/).*)"],
};
