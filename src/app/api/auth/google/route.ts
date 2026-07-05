import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { buildAuthUrl } from "@/lib/google-oauth";
import { OAUTH_STATE_COOKIE, challengeCookieOptions } from "@/lib/session";

/** Inicia "Continuar con Google": genera state anti-CSRF y redirige. */
export function GET(request: NextRequest) {
  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthUrl(request.nextUrl.origin, state));
  // Mismas opciones que el challenge de WebAuthn: httpOnly, 5 minutos
  response.cookies.set(OAUTH_STATE_COOKIE, state, challengeCookieOptions);
  return response;
}
