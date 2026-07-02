import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { getRpConfig, saveCredential } from "@/lib/webauthn";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  createSessionToken,
  readChallengeToken,
  sessionCookieOptions,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const challengeToken = request.cookies.get(CHALLENGE_COOKIE)?.value;
  const expectedChallenge = challengeToken ? await readChallengeToken(challengeToken) : null;
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Challenge expirado, intenta de nuevo" }, { status: 400 });
  }

  const body = (await request.json()) as RegistrationResponseJSON;
  const { rpID, origin } = getRpConfig(request.nextUrl.origin);

  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "No se pudo verificar el passkey" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  await saveCredential({
    id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? null,
  });

  const response = NextResponse.json({ verified: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  response.cookies.delete(CHALLENGE_COOKIE);
  return response;
}
