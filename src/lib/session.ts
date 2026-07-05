import { SignJWT, jwtVerify } from "jose";

/**
 * Sesión propia con JWT en cookie httpOnly. Se usa jose (y no una lib de
 * sesiones) porque el middleware corre en el edge runtime de Next.js.
 */

export const SESSION_COOKIE = "peso_session";
export const CHALLENGE_COOKIE = "peso_challenge";
export const OAUTH_STATE_COOKIE = "peso_oauth_state";
const SESSION_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Falta SESSION_SECRET (genera uno con: openssl rand -base64 32)");
  }
  return new TextEncoder().encode(secret);
}

/** `sub` es el uuid del usuario en la tabla users. */
export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  return (await readSessionUserId(token)) !== null;
}

/** user_id de la sesión, o null si el token es inválido/expirado. */
export async function readSessionUserId(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Challenge WebAuthn firmado, de corta vida, guardado en cookie entre options → verify. */
export async function createChallengeToken(challenge: string): Promise<string> {
  return new SignJWT({ challenge })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(getSecret());
}

export async function readChallengeToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.challenge === "string" ? payload.challenge : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export const challengeCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 5 * 60,
};
