import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getCredentialsForUser, getRpConfig } from "@/lib/webauthn";
import { getUserById } from "@/lib/users";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  challengeCookieOptions,
  createChallengeToken,
  readSessionUserId,
} from "@/lib/session";

/**
 * Registra un passkey del dispositivo para el bloqueo con Face ID.
 * Requiere sesión activa (el login primario es Google).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = token ? await readSessionUserId(token) : null;
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const credentials = await getCredentialsForUser(userId);
  const { rpID } = getRpConfig(request.nextUrl.origin);
  const options = await generateRegistrationOptions({
    rpName: "Peso",
    rpID,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    attestationType: "none",
    excludeCredentials: credentials.map((c) => ({
      id: c.id,
      transports: c.transports ?? undefined,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const response = NextResponse.json(options);
  response.cookies.set(
    CHALLENGE_COOKIE,
    await createChallengeToken(options.challenge),
    challengeCookieOptions,
  );
  return response;
}
