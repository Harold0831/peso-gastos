/* Service worker de Peso: solo necesario para que iOS permita instalar la
   PWA — el registro en sí ya habilita "Agregar a inicio". Cachea
   únicamente estáticos (JS/CSS/íconos); las navegaciones (HTML) NUNCA se
   interceptan.

   Por qué: clonar y cachear la respuesta de navegación (bug real,
   corregido el 2026-07-04) rompe el streaming SSR de Next.js — App
   Router resuelve cada Suspense boundary (los loading.tsx) mandando el
   HTML en chunks progresivos sobre la MISMA response; en cuanto el SW le
   hace event.respondWith() a esa respuesta y además la clona para
   cachearla, el navegador se queda mostrando el fallback del primer chunk
   para siempre y el contenido real nunca llega a pintarse. Además, Peso
   es 100% dinámica (fuerza force-dynamic en cada página) — cachear HTML
   de navegación no tiene sentido aquí: la próxima visita a esa ruta
   siempre debe traer datos frescos de Supabase, nunca lo último cacheado. */

const CACHE = "peso-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") return; // deja pasar: nunca interceptar HTML

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Estáticos: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});

/* Notificaciones push (Web Push). El payload viene de lib/push.ts:
   { title, body, url }. En iOS solo llegan con la PWA instalada. */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Peso", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

/* Al tocar la notificación: enfoca una pestaña abierta de la app (y navega
   a la URL del payload) o abre una nueva. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
