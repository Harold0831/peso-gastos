import { NextResponse, type NextRequest } from "next/server";
import { watchGmailMailbox } from "@/lib/gmail";

/**
 * Renueva la suscripción de Gmail Push (expira a los 7 días máximo).
 * Disparado 1x/día por el cron de vercel.json — 1x/día es gratis en
 * plan Hobby de Vercel, a diferencia de un cron cada pocos minutos.
 *
 * Usa CRON_SECRET (no SYNC_SECRET): Vercel solo inyecta automáticamente
 * el header "Authorization: Bearer $CRON_SECRET" en sus propios cron jobs
 * cuando la env var se llama exactamente así — es una convención de
 * Vercel, no configurable. SYNC_SECRET queda para /api/sync (llamadas
 * externas manuales, curl, atajos de iOS).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!topic) {
    return NextResponse.json({ error: "Falta GMAIL_PUBSUB_TOPIC" }, { status: 503 });
  }

  try {
    const result = await watchGmailMailbox(topic);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 500 },
    );
  }
}
