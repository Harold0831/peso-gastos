import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getCredentials, getRpConfig, WEBAUTHN_USER } from "@/lib/webauthn";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  challengeCookieOptions,
  createChallengeToken,
  verifySessionToken,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const credentials = await getCredentials();

  // Registro abierto solo si aún no hay ningún passkey (primer setup).
  // Con passkeys existentes se exige sesión activa para añadir otro dispositivo.
  if (credentials.length > 0) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token || !(await verifySessionToken(token))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  const { rpID } = getRpConfig(request.nextUrl.origin);
  const options = await generateRegistrationOptions({
    rpName: "Peso",
    rpID,
    userName: WEBAUTHN_USER.name,
    userDisplayName: WEBAUTHN_USER.displayName,
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
