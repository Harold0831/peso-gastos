import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getCredentialsForUser, getRpConfig } from "@/lib/webauthn";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  challengeCookieOptions,
  createChallengeToken,
  readSessionUserId,
} from "@/lib/session";

/**
 * Opciones para desbloquear la app con el passkey del usuario en sesión
 * (AppLockGate). 404 con "no_credentials" si este usuario no tiene
 * passkeys registrados — el gate lo interpreta como "sin bloqueo".
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await readSessionUserId(token) : null;
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const credentials = await getCredentialsForUser(userId);
  if (credentials.length === 0) {
    return NextResponse.json({ error: "no_credentials" }, { status: 404 });
  }

  const { rpID } = getRpConfig(request.nextUrl.origin);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials: credentials.map((c) => ({
      id: c.id,
      transports: c.transports ?? undefined,
    })),
  });

  const response = NextResponse.json(options);
  response.cookies.set(
    CHALLENGE_COOKIE,
    await createChallengeToken(options.challenge),
    challengeCookieOptions,
  );
  return response;
}
