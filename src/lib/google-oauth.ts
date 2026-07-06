import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Flujo OAuth 2.0 de Google (authorization code) para "Continuar con Google".
 * Un solo consent pide identidad (openid/email/profile) + gmail.readonly:
 * la cuenta de Google es el login Y el permiso para importar correos de Qik.
 *
 * gmail.readonly es un scope sensible y aparece como checkbox opcional en la
 * pantalla de consentimiento — el usuario puede desmarcarlo y aún así crear
 * su cuenta (la app queda en modo manual hasta que vincule Gmail después).
 *
 * Reusa el OAuth client existente (GMAIL_CLIENT_ID/SECRET). Requiere
 * agregar el redirect URI /api/auth/google/callback en Google Cloud Console.
 */

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const IDENTITY_SCOPES = ["openid", "email", "profile"];

function getClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET");
  }
  return { clientId, clientSecret };
}

export function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

/**
 * URL de autorización de Google. `state` debe validarse en el callback (CSRF).
 *
 * `forceConsent` controla la fricción del login: sin él, Google NO vuelve
 * a mostrar la pantalla de permisos a quien ya autorizó (login de 1 tap),
 * pero tampoco emite refresh_token. Con él, muestra el consent completo y
 * SÍ emite refresh_token. Solo se fuerza cuando hace falta el token:
 * vincular/reconectar Gmail desde /profile, o cuando el callback detecta
 * un primer login con permiso de Gmail concedido pero sin refresh_token
 * guardado. Forzarlo siempre (bug original) hacía que cada login pidiera
 * todos los permisos de nuevo.
 */
export function buildAuthUrl(
  origin: string,
  state: string,
  options?: { forceConsent?: boolean },
): string {
  const { clientId } = getClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: [...IDENTITY_SCOPES, GMAIL_SCOPE].join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    state,
  });
  if (options?.forceConsent) params.set("prompt", "consent");
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  id_token: string;
  scope: string;
}

export async function exchangeCode(origin: string, code: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getClient();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(origin),
    }),
  });
  if (!res.ok) {
    throw new Error(`Intercambio de código falló (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<GoogleTokens>;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** Verifica la firma y claims del id_token y extrae la identidad. */
export async function verifyIdToken(idToken: string): Promise<GoogleIdentity> {
  const { clientId } = getClient();
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("id_token sin sub o email");
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

export function hasGmailScope(scope: string): boolean {
  return scope.split(" ").includes(GMAIL_SCOPE);
}
