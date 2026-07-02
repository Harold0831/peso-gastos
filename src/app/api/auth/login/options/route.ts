import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getCredentials, getRpConfig } from "@/lib/webauthn";
import { CHALLENGE_COOKIE, challengeCookieOptions, createChallengeToken } from "@/lib/session";

export async function POST(request: NextRequest) {
  const credentials = await getCredentials();
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
