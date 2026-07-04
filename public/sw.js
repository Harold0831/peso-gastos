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
