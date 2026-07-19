import "server-only";
import webpush from "web-push";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

/**
 * Envío de notificaciones push (Web Push + VAPID). Fallo suave en todo el
 * módulo: las notificaciones son un extra — un fallo aquí jamás debe
 * tumbar el sync que las dispara.
 *
 * Claves VAPID: `npx web-push generate-vapid-keys` una sola vez →
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY (el navegador la necesita al suscribirse)
 * y VAPID_PRIVATE_KEY (solo servidor). Sin ellas, todo esto se apaga en
 * silencio y la app funciona igual que antes.
 *
 * En iOS las push de una PWA solo llegan si está instalada en la pantalla
 * de inicio (requisito de Apple, iOS 16.4+).
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Ruta a abrir al tocar la notificación, ej. "/transactions?filter=pendientes". */
  url: string;
}

function vapidConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Envía a todos los dispositivos suscritos del usuario; poda los muertos. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidConfigured() || !isSupabaseConfigured()) return;

  webpush.setVapidDetails(
    "mailto:harold3112@gmail.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const supabase = getSupabaseAdmin();
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error || !subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = suscripción expirada o revocada: se poda para no
        // reintentar eternamente contra un dispositivo que ya no existe.
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("[push] Error enviando a", sub.endpoint.slice(0, 40), err);
        }
      }
    }),
  );
}
