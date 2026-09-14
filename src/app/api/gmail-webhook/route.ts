import { NextResponse, type NextRequest } from "next/server";
import { runSyncForGmailAddress } from "@/lib/sync";
import { verifyPubSubPushToken } from "@/lib/gmail-webhook";
import { isSupabaseConfigured } from "@/lib/supabase";
import { reportIssue } from "@/lib/monitoring";

export const maxDuration = 60;

/**
 * Recibe las notificaciones push de Cloud Pub/Sub cuando llega un correo
 * nuevo a Gmail (activadas por watchGmailMailbox, ver /api/gmail-watch/renew).
 *
 * Con multi-usuario, todos los watches publican al mismo tópico — el
 * payload de Pub/Sub trae el emailAddress del buzón que cambió, y con eso
 * se sincroniza solo a ese usuario. runSyncForUser ya es idempotente
 * (filtra por gmail_message_id existente), así que notificaciones
 * repetidas o correos no-Qik no ensucian nada.
 * Responde 200 rápido para que Pub/Sub no reintente innecesariamente.
 */
export async function POST(request: NextRequest) {
  const authorized = await verifyPubSubPushToken(request.headers.get("authorization"));
  if (!authorized) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    // Responde 200 igual: si Pub/Sub reintenta un 5xx indefinidamente no ayuda a nadie.
    return NextResponse.json({ synced: 0, errors: ["Supabase no configurado"] });
  }

  let emailAddress: string | null = null;
  try {
    // Formato push de Pub/Sub: { message: { data: base64("{emailAddress, historyId}") } }
    const body = (await request.json()) as { message?: { data?: string } };
    if (body.message?.data) {
      const decoded = JSON.parse(Buffer.from(body.message.data, "base64").toString("utf-8")) as {
        emailAddress?: string;
      };
      emailAddress = decoded.emailAddress ?? null;
    }
  } catch {
    // payload malformado: cae al 200 vacío de abajo
  }

  if (!emailAddress) {
    return NextResponse.json({ synced: 0, errors: ["Notificación sin emailAddress"] });
  }

  try {
    const result = await runSyncForGmailAddress(emailAddress);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";

    // El motivo tiene que quedar en los LOGS, no solo en la respuesta: quien
    // llama a este endpoint es Pub/Sub, que descarta el cuerpo. Sin esto, un
    // webhook roto solo dejaba un "500" pelado en Vercel, sin una línea que
    // dijera por qué — y como el fallo fue una EXCEPCIÓN (no un
    // `SyncResult.errors`), `reportSyncErrors` tampoco llegaba a avisar. O
    // sea: el sync automático podía romperse en silencio, que es exactamente
    // lo que este monitoreo existe para impedir.
    console.error(`[gmail-webhook] sync de ${emailAddress} falló:`, err);
    await reportIssue({
      context: "webhook de Gmail (excepción)",
      message: `El sync automático de ${emailAddress} lanzó una excepción y no importó nada.`,
      details: [message],
    }).catch(() => {});

    // 500 a propósito: Pub/Sub reintenta con backoff, y estas excepciones son
    // casi siempre transitorias (un hipo de Supabase o de la API de Gmail).
    // Los fallos que NO se arreglan reintentando —token revocado, cuenta sin
    // buzón— los resuelve runSyncForUser antes de llegar aquí, devolviendo un
    // resultado normal en vez de lanzar.
    return NextResponse.json({ synced: 0, errors: [message] }, { status: 500 });
  }
}
