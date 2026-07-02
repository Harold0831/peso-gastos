import { NextResponse, type NextRequest } from "next/server";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { getCredentialById, getRpConfig, updateCounter } from "@/lib/webauthn";
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

  const body = (await request.json()) as AuthenticationResponseJSON;
  const stored = await getCredentialById(body.id);
  if (!stored) {
    return NextResponse.json({ error: "Passkey desconocido" }, { status: 400 });
  }

  const { rpID, origin } = getRpConfig(request.nextUrl.origin);
  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: stored.id,
      publicKey: new Uint8Array(Buffer.from(stored.public_key, "base64url")),
      counter: stored.counter,
      transports: stored.transports ?? undefined,
    },
  });

  if (!verification.verified) {
    return NextResponse.json({ error: "No se pudo verificar el passkey" }, { status: 400 });
  }

  await updateCounter(stored.id, verification.authenticationInfo.newCounter);

  const response = NextResponse.json({ verified: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  response.cookies.delete(CHALLENGE_COOKIE);
  return response;
}
