import "server-only";

/**
 * Cliente mínimo de la API de Gmail usando fetch directo (sin googleapis,
 * que pesa ~100 MB y no aporta nada para 3 endpoints). Autentica con un
 * refresh token OAuth2 de larga vida — ver CLAUDE.md para obtenerlo.
 */

const QIK_SENDER = "ayuda@qik.com.do";

export interface GmailMessage {
  id: string;
  subject: string;
  body: string;
  snippet: string;
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET o GMAIL_REFRESH_TOKEN");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo refrescar el token de Gmail (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function gmailFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${path} falló (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

/** Busca recursivamente la mejor parte del cuerpo: text/plain primero, luego text/html. */
function extractBody(payload: MessagePart): string {
  const collect = (part: MessagePart, mime: string): string | null => {
    if (part.mimeType === mime && part.body?.data) return decodeBase64Url(part.body.data);
    for (const child of part.parts ?? []) {
      const found = collect(child, mime);
      if (found) return found;
    }
    return null;
  };
  return (
    collect(payload, "text/plain") ??
    collect(payload, "text/html") ??
    (payload.body?.data ? decodeBase64Url(payload.body.data) : "")
  );
}

/**
 * Lista los correos de Qik de los últimos `newerThanDays` días y devuelve
 * id, asunto y cuerpo decodificado de cada uno.
 */
export async function fetchQikEmails(newerThanDays = 7): Promise<GmailMessage[]> {
  const accessToken = await getAccessToken();
  const query = encodeURIComponent(`from:${QIK_SENDER} newer_than:${newerThanDays}d`);

  const list = await gmailFetch<{ messages?: { id: string }[] }>(
    `/messages?q=${query}&maxResults=100`,
    accessToken,
  );
  if (!list.messages?.length) return [];

  const messages = await Promise.all(
    list.messages.map(async ({ id }) => {
      const msg = await gmailFetch<{
        id: string;
        snippet: string;
        payload: MessagePart & { headers?: { name: string; value: string }[] };
      }>(`/messages/${id}?format=full`, accessToken);

      const subject =
        msg.payload.headers?.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
      return {
        id: msg.id,
        subject,
        body: extractBody(msg.payload),
        snippet: msg.snippet,
      };
    }),
  );
  return messages;
}
