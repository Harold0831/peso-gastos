import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { getRpConfig, saveCredential } from "@/lib/webauthn";
import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  readChallengeToken,
  readSessionUserId,
} from "@/lib/session";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = sessionToken ? await readSessionUserId(sessionToken) : null;
  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

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
    user_id: userId,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? null,
  });

  const response = NextResponse.json({ verified: true });
  response.cookies.delete(CHALLENGE_COOKIE);
  return response;
}
