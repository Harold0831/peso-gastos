import { NextResponse, type NextRequest } from "next/server";
import { runSyncForGmailAddress } from "@/lib/sync";
import { verifyPubSubPushToken } from "@/lib/gmail-webhook";
import { isSupabaseConfigured } from "@/lib/supabase";

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
    return NextResponse.json(
      { synced: 0, errors: [err instanceof Error ? err.message : "Error desconocido"] },
      { status: 500 },
    );
  }
}
