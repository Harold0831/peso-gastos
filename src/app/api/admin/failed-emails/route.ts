import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { listFailedEmails } from "@/lib/failed-emails";
import { isSupabaseConfigured } from "@/lib/supabase";
import { RATE_LIMITED_MESSAGE, checkRateLimit, clientIp } from "@/lib/rate-limit";

/**
 * Devuelve los correos que ningún parser supo leer, con el cuerpo descifrado,
 * para poder escribir el arreglo del parser.
 *
 * Es la última pieza del monitoreo: el webhook de Discord avisa de QUE algo se
 * rompió y manda el esqueleto, pero cuando un banco cambia el formato entero
 * el esqueleto no basta (con el Popular decía "Etiquetas encontradas:
 * ninguna"). Y como el push de Gmail dispara para el buzón que CAMBIÓ, el
 * correo casi nunca es del que opera la instancia — sin esto no hay muestra
 * con la que trabajar.
 *
 * Protegido por `ADMIN_SECRET` igual que /api/admin/mint-token, y limitado por
 * IP: devuelve notificaciones bancarias de otras personas, así que es el
 * endpoint más sensible de la app. Lo que sale de aquí sirve para UNA cosa —
 * escribir el parser y su fixture de test — y no debe acabar en ningún otro
 * sitio. Las muestras caducan solas (ver FAILED_EMAIL_RETENTION_DAYS).
 *
 *   curl "https://.../api/admin/failed-emails?bank=popular" \
 *     -H "Authorization: Bearer $ADMIN_SECRET"
 *
 * Acepta `?message=<gmail_message_id>` (el id que sale en el aviso de
 * monitoreo) y `?subject=consumo` para pedir UNA muestra en vez de la tabla.
 * No es comodidad: cada fila es el correo bancario de otra persona, y para
 * escribir un parser hace falta un correo de cada FORMATO, no cincuenta del
 * mismo. Pedir menos es parte de lo que hace aceptable que esto exista.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMIN_SECRET no configurado" }, { status: 503 });
  }
  if (!(await checkRateLimit(`failed-emails:${clientIp(request)}`, 10, 3600))) {
    return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
  }

  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!constantTimeEqual(provided, secret)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const bank = searchParams.get("bank") ?? undefined;
  const subject = searchParams.get("subject") ?? undefined;
  const messageId = searchParams.get("message") ?? undefined;
  const limit = Number(searchParams.get("limit")) || 20;

  try {
    // Deliberadamente NO devuelve el user_id ni el correo del dueño: para
    // arreglar un parser hace falta el formato del mensaje, no saber de quién
    // es. El buzón afectado ya va en el aviso de Discord si hiciera falta
    // pedirle permiso a alguien.
    const samples = await listFailedEmails({
      bank,
      subject,
      messageId,
      limit: Math.min(limit, 50),
    });
    return NextResponse.json({ count: samples.length, samples });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error" },
      { status: 500 },
    );
  }
}

/** Comparación en tiempo constante que no filtra longitud por early-return. */
function constantTimeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
