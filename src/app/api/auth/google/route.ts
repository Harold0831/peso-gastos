import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl } from "@/lib/google-oauth";
import { OAUTH_STATE_COOKIE, challengeCookieOptions } from "@/lib/session";

/**
 * Inicia "Continuar con Google". Con ?consent=1 fuerza la pantalla de
 * permisos (necesaria para obtener refresh_token — la usan los botones de
 * vincular/reconectar Gmail en /profile y el reintento automático del
 * callback). Sin el parámetro, el login de un usuario que ya autorizó es
 * de 1 tap, sin volver a pedir permisos.
 */
export function GET(request: NextRequest) {
  const forceConsent = request.nextUrl.searchParams.get("consent") === "1";
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(
    buildAuthUrl(request.nextUrl.origin, state, { forceConsent }),
  );
  // Mismas opciones que el challenge de WebAuthn: httpOnly, 5 minutos
  response.cookies.set(OAUTH_STATE_COOKIE, state, challengeCookieOptions);
  return response;
}
