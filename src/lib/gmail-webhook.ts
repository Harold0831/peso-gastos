import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Verifica el JWT de identidad (OIDC) que Google Cloud Pub/Sub adjunta a
 * cada push request en el header "Authorization: Bearer <token>". Esto es
 * lo único que distingue una notificación legítima de Gmail de cualquiera
 * que le haga POST a la URL del webhook — sin esto, el endpoint estaría
 * abierto a que cualquiera dispare un sync a voluntad.
 *
 * La suscripción de Pub/Sub debe crearse con autenticación OIDC habilitada
 * y "audience" = GMAIL_WEBHOOK_AUDIENCE (ver CLAUDE.md § Gmail Push).
 */

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyPubSubPushToken(authHeader: string | null): Promise<boolean> {
  const audience = process.env.GMAIL_WEBHOOK_AUDIENCE;
  if (!audience || !authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice("Bearer ".length);
  try {
    await jwtVerify(token, GOOGLE_JWKS, {
      issuer: "https://accounts.google.com",
      audience,
    });
    return true;
  } catch {
    return false;
  }
}
