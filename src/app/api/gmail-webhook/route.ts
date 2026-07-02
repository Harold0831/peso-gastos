import { NextResponse, type NextRequest } from "next/server";
import { runSync } from "@/lib/sync";
import { verifyPubSubPushToken } from "@/lib/gmail-webhook";
import { isSupabaseConfigured } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * Recibe las notificaciones push de Cloud Pub/Sub cuando llega un correo
 * nuevo a Gmail (activadas por watchGmailMailbox, ver /api/gmail-watch/renew).
 *
 * No hace falta parsear el body de Pub/Sub (trae emailAddress + historyId
 * en base64): basta con re-ejecutar runSync(), que ya es idempotente
 * (filtra por gmail_message_id existente) y solo procesa correos de Qik.
 * Responde rápido con 200 para que Pub/Sub no reintente innecesariamente.
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

  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { synced: 0, errors: [err instanceof Error ? err.message : "Error desconocido"] },
      { status: 500 },
    );
  }
}
