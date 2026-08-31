import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Protege todas las rutas excepto /login, /privacy, /terms, las rutas de auth, /api/sync,
 * /api/gmail-webhook, /api/gmail-watch, /api/voice-entry y /api/admin (cada
 * una protegida por su propio mecanismo: Bearer SYNC_SECRET/ADMIN_SECRET,
 * token de API por usuario, o el JWT de identidad de Pub/Sub) y los assets
 * de la PWA.
 *
 * En dev sin Supabase configurado se deja pasar todo: no hay dónde guardar
 * credenciales de passkey, así que la app corre abierta con datos mock.
 */

const PUBLIC_PATHS = [
  "/login",
  // Google exige que la política de privacidad sea accesible SIN sesión para
  // verificar el scope gmail.readonly; los términos van con ella.
  "/privacy",
  "/terms",
  "/api/auth",
  "/api/sync",
  "/api/gmail-webhook",
  "/api/gmail-watch",
  "/api/voice-entry",
  "/api/admin",
];

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
