import "server-only";

/**
 * Cliente mínimo de la API de Gmail usando fetch directo (sin googleapis,
 * que pesa ~100 MB y no aporta nada para 3 endpoints). Con multi-usuario,
 * cada función recibe el refresh token del usuario (guardado cifrado en
 * gmail_accounts) — ya no hay un token global en env vars.
 */

/** El refresh token fue revocado o expiró: el usuario debe reconectar Gmail. */
export class GmailAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailAuthError";
  }
}

/**
 * La cuenta de Google NO tiene buzón de Gmail.
 *
 * Pasa de verdad: se puede entrar con Google usando una dirección que no es de
 * Gmail (`…@live.com.mx`, `…@outlook.com`), y esa cuenta pasa el OAuth y otorga
 * el scope `gmail.readonly` sin problema — pero al leer el buzón la API
 * responde 400 `failedPrecondition` "Mail service not enabled".
 *
 * Se separa de `GmailAuthError` porque el remedio es DISTINTO: un token
 * revocado se arregla reconectando, y esto no se arregla con nada — no hay
 * buzón que leer. Sin distinguirlo, el sync reintentaba en cada corrida para
 * siempre, gastando una llamada a la API y una línea de error en el monitoreo
 * de todos los syncs.
 */
export class GmailUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailUnavailableError";
  }
}

/** ¿La respuesta de error dice que la cuenta no tiene buzón de Gmail? */
function isMailServiceDisabled(status: number, body: string): boolean {
  return status === 400 && /mail service not enabled|failedPrecondition/i.test(body);
}

import { BANK_SENDERS } from "./bank-parser";

export interface GmailMessage {
  id: string;
  /** Dirección del remitente en minúsculas (sin display name). */
  from: string;
  subject: string;
  body: string;
  snippet: string;
  /** Cuándo llegó el correo — fallback de fecha para bancos cuyo cuerpo
   *  trae hora pero no fecha (Scotiabank). */
  receivedAt: Date;
}

async function getAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan GMAIL_CLIENT_ID o GMAIL_CLIENT_SECRET");
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
    const body = await res.text();
    // invalid_grant = token revocado (el usuario quitó el acceso en su
    // cuenta de Google) o expirado — hay que pedirle que reconecte.
    if (res.status === 400 && body.includes("invalid_grant")) {
      throw new GmailAuthError("El acceso a Gmail fue revocado o expiró");
    }
    throw new Error(`No se pudo refrescar el token de Gmail (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function gmailFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    if (isMailServiceDisabled(res.status, body)) {
      throw new GmailUnavailableError("Esta cuenta de Google no tiene Gmail");
    }
    throw new Error(`Gmail API ${path} falló (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

async function gmailPost<T>(path: string, accessToken: string, body: unknown): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (isMailServiceDisabled(res.status, text)) {
      throw new GmailUnavailableError("Esta cuenta de Google no tiene Gmail");
    }
    throw new Error(`Gmail API ${path} falló (${res.status}): ${text}`);
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

/** Procesa `items` con `run`, sin más de `limit` llamadas en vuelo a la vez. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Lista los correos de los bancos soportados (ver bank-parser.ts) de los
 * últimos `newerThanDays` días y devuelve remitente, asunto y cuerpo
 * decodificado de cada uno. Pagina si hay más de 100 resultados y limita
 * la concurrencia al pedir el detalle de cada uno — la API de Gmail
 * rechaza con 429 ("too many concurrent requests") si se disparan todas
 * las peticiones a la vez, algo que solo se nota con ventanas largas
 * (backfills) ya que el día a día trae pocos correos.
 */
export async function fetchBankEmails(
  refreshToken: string,
  newerThanDays = 7,
  senders: string[] = BANK_SENDERS,
  options?: {
    /**
     * Filtro entre las DOS fases: recibe todos los ids que encontró la
     * búsqueda y devuelve solo los que hay que descargar.
     *
     * Es el parámetro más importante de esta función. El listado de Gmail
     * devuelve ids —baratos, 1 petición por cada 100— pero el cuerpo de cada
     * correo es UNA petición más, y esas son las que cuestan el tiempo. Sin
     * este filtro se descargaban los ~100 correos de la ventana para que el
     * sync descartara después los que ya estaban en la base: un usuario ya
     * sincronizado pagaba cien peticiones por corrida para no hacer nada.
     *
     * Con un backfill de 30 días eso hacía que el presupuesto de tiempo se
     * gastara entero en los primeros usuarios y los últimos no se
     * sincronizaran NUNCA, por muchas veces que se repitiera la llamada.
     */
    selectIds?: (ids: string[]) => Promise<string[]> | string[];
  },
): Promise<GmailMessage[]> {
  const accessToken = await getAccessToken(refreshToken);
  const fromClause = senders.map((s) => `from:${s}`).join(" OR ");
  const query = encodeURIComponent(`(${fromClause}) newer_than:${newerThanDays}d`);

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `/messages?q=${query}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`,
      accessToken,
    );
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken);

  const wanted = options?.selectIds ? await options.selectIds(ids) : ids;
  if (wanted.length === 0) return [];

  return mapWithConcurrency(wanted, 10, async (id) => {
    const msg = await gmailFetch<{
      id: string;
      snippet: string;
      internalDate: string;
      payload: MessagePart & { headers?: { name: string; value: string }[] };
    }>(`/messages/${id}?format=full`, accessToken);

    const header = (name: string) =>
      msg.payload.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
    const fromRaw = header("from");
    // "Nombre <correo@x.com>" → "correo@x.com"
    const from = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim().toLowerCase();
    return {
      id: msg.id,
      from,
      subject: header("subject"),
      body: extractBody(msg.payload),
      snippet: msg.snippet,
      receivedAt: new Date(Number(msg.internalDate)),
    };
  });
}

/**
 * Activa las notificaciones push de Gmail: le pide a Google que publique en
 * `topicName` (un tópico de Cloud Pub/Sub) cada vez que cambia el inbox.
 * La suscripción expira a los 7 días máximo — hay que renovarla antes con
 * `POST /api/gmail-watch/renew` (ver vercel.json, cron diario).
 */
export async function watchGmailMailbox(
  refreshToken: string,
  topicName: string,
): Promise<{ historyId: string; expiration: string }> {
  const accessToken = await getAccessToken(refreshToken);
  return gmailPost("/watch", accessToken, {
    topicName,
    labelIds: ["INBOX"],
    labelFilterAction: "include",
  });
}
