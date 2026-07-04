# Peso — Finanzas personales (PWA)

App personal de rastreo de gastos e ingresos para Harold. Importa
automáticamente las notificaciones de transacciones del banco **Qik**
(neobanco dominicano) desde Gmail, las categoriza con Gemini y las presenta
en una PWA móvil instalable en iPhone. Un solo usuario, desplegada en Vercel.

## Comandos

```bash
npm run dev        # servidor de desarrollo (http://localhost:3000)
npm run build      # build de producción
npm run lint       # ESLint
npx vitest run     # tests unitarios (parser de correos Qik)
npx prettier --write .   # formatear
node scripts/generate-icons.mjs   # regenerar íconos PWA
```

**Modo demo:** sin `.env.local` la app corre con datos mock y sin login —
toda la UI es navegable. Las mutaciones devuelven un error amigable.
Con Supabase configurado, el middleware exige sesión por passkey.

## Arquitectura

```
src/
├── middleware.ts             # Protege todo excepto /login, /api/auth, /api/sync, /api/gmail-*
├── app/
│   ├── layout.tsx            # Fuente Inter, meta PWA, theme script
│   ├── manifest.ts           # Web manifest (→ /manifest.webmanifest)
│   ├── login/                # Login con passkey (WebAuthn)
│   ├── (app)/                # Shell con BottomNav — pantallas principales
│   │   ├── page.tsx          # 1. Dashboard: balance, pills, donut, recientes
│   │   ├── loading.tsx       #    Skeleton — una por pantalla, ver abajo
│   │   ├── transactions/     # 2. Lista con filtros + 3. detalle/confirmar
│   │   │   ├── loading.tsx
│   │   │   └── new/          #    Alta manual (FAB central) — RHF + Zod
│   │   ├── charts/           # 4. Gráficas (Recharts) con selector de mes
│   │   │   └── loading.tsx
│   │   ├── budget/           # 5. Presupuestos por categoría
│   │   │   └── loading.tsx
│   │   └── goals/            # 6. Metas de ahorro con abonos
│   │       └── loading.tsx
│   └── api/
│       ├── auth/              # register/login options+verify, logout (WebAuthn)
│       ├── sync/               # GET protegido con Bearer SYNC_SECRET (sync manual)
│       ├── gmail-webhook/      # POST — recibe push de Gmail, dispara runSync()
│       └── gmail-watch/renew/  # GET protegido con Bearer CRON_SECRET (cron diario)
├── lib/
│   ├── data.ts             # Lecturas (Supabase o mock si no hay env)
│   ├── actions.ts          # Server actions de mutación (confirmar, crear…)
│   ├── schemas.ts          # Schemas Zod compartidos
│   ├── sync.ts             # Pipeline Gmail → parser → Gemini → Supabase
│   ├── qik-parser.ts       # Parser de correos Qik (puro, con tests)
│   ├── gmail.ts             # Cliente Gmail REST (fetch + refresh token + watch)
│   ├── gmail-webhook.ts     # Verificación del JWT de Pub/Sub push
│   ├── gemini.ts             # Categorización con gemini-2.0-flash
│   ├── supabase.ts           # Cliente admin (service role, solo servidor)
│   ├── session.ts            # JWT de sesión con jose (corre en edge)
│   ├── webauthn.ts           # Credenciales passkey en Supabase
│   ├── webauthn-client.ts    # verifyPasskey() — /login y AppLockGate lo comparten
│   └── app-lock.ts           # Umbral de re-bloqueo (sessionStorage)
├── components/                # BottomNav, TxRow, Donut, PullToRefresh, Skeleton,
│                               # AppLockGate + LockScreen (re-bloqueo con Face ID)
supabase/
├── migrations/0001_init.sql # Tablas + RLS
└── seed.sql                 # Categorías por defecto
public/sw.js                 # Service worker (network-first)
design/                      # Referencias visuales (no es código de la app)
```

### Flujo de datos

- **Lecturas**: server components → `lib/data.ts` → Supabase con service
  role key. Todas las páginas son `force-dynamic` (datos cambian a cada sync).
  Cada ruta tiene su `loading.tsx` (skeleton) — Next.js lo muestra
  automáticamente vía Suspense mientras el server component espera a
  Supabase, así que cambiar de pestaña siempre da feedback visual
  inmediato en vez de quedarse "congelado" unos segundos.
- **Mutaciones**: client components → server actions (`lib/actions.ts`) →
  validación Zod → Supabase → `revalidatePath`. Incluye `deleteTransaction`
  (botón "Eliminar transacción" en el detalle, con confirmación de dos
  pasos) — antes de esto no había forma de quitar un duplicado desde la
  UI, solo editar el monto (con el schema exigiendo > 0, ni siquiera se
  podía poner en cero).
- **Sync automático**: Gmail Push (Cloud Pub/Sub) notifica a
  `POST /api/gmail-webhook` en cuanto llega un correo nuevo → `runSync()`.
  La suscripción (`watchGmailMailbox`) expira a los 7 días máximo; se
  renueva sola 1x/día vía el cron de `vercel.json` (`GET
  /api/gmail-watch/renew`, Bearer `CRON_SECRET`). Ver § Gmail Push abajo
  para la configuración (requiere pasos manuales en Google Cloud Console).
- **Sync manual (fallback)**: botón "Sincronizar" (ícono refresh) y
  pull-to-refresh de /transactions → server action `syncNow` → `runSync()`.
  Útil si el webhook falla o mientras configuras Gmail Push por primera
  vez. También existe `GET /api/sync` (Bearer `SYNC_SECRET`) para
  dispararlo desde fuera (curl, atajos de iOS…).

## Parser de correos Qik

Qik notifica transacciones desde **dos remitentes distintos**:

- `no-reply-qik@qik.com.do` → pagos de servicio, retiros CASH, Toke.
- `notificaciones@qik.do` → compras con tarjeta débito/crédito. Nótese el
  dominio **`qik.do`** (sin el ".com") — es fácil filtrar solo el primero y
  perder silenciosamente TODAS las compras con tarjeta (bug real: ~300
  correos de un año nunca se sincronizaron por esto, corregido el
  2026-07-04, ver git log — Harold sí las recibía, solo que el sync nunca
  las buscaba en el remitente correcto).

`ayuda@qik.com.do` **no es remitente** — es la dirección de soporte que Qik
menciona en el pie de página. Los promocionales vienen de otras direcciones
(`promociones@mail.qik.com.do`, etc.) y quedan excluidos al no estar en la
lista de remitentes filtrados.

Tipos de correo transaccionales confirmados contra la bandeja real:

1. **"Pago de servicio realizado"** → gasto (pago de una factura).
   Campos: "Monto total pagado", "Fecha y hora" (`02 julio 2026 / 10:57 a. m.`),
   "Servicio" (usado como `merchant`), "Forma de pago" (`Visa *3326` → últimos
   4 dígitos).
2. **"Retiro con Código CASH exitoso"** → gasto (retiro en cajero).
   Campos: "Monto", "Fecha" (`18 de jun 2026`, sin hora). `merchant` fijo:
   "Retiro Código CASH". Sin tarjeta.
3. **Cuerpo con "Has recibido RD$…"** (asunto tipo "💵 Te han enviado un
   Toke") → ingreso (transferencia P2P). Campos: "Monto", "Fecha" (sin
   hora), "Realizado por" (usado como `merchant`).
4. **Compra con tarjeta** — asunto "Usaste tu tarjeta…" o "Se hizo una
   transacción con tu tarjeta…" → gasto. Dos plantillas según la fecha del
   correo (ambas soportadas):
   - **Nueva (2026)**: campos "Localidad", "Fecha y hora"
     (`07-04-2026 01:11 PM (AST)`), "Monto" (con prefijo `RD$`), "Balance
     Disponible", "Tarjeta Débito" (`49***...3326` → últimos 4 dígitos).
   - **Vieja (2025)**: mismos campos pero el comercio es "Lugar" (no
     "Localidad"), el monto viene sin el prefijo `RD` (solo `$ 20.00`), no
     hay "Balance Disponible", y agrega "Estatus" (`Aprobada`/`Declinado`).
     **Una compra con "Estatus: Declinado" usa el mismo asunto que una
     aprobada** — el parser solo la acepta si el estatus es
     Aprobada/Exitoso; si no, se ignora sin reportar error.
5. **"Se reversó una transacción…"** → ingreso (reembolso: el comercio o
   Qik devuelve el monto de una compra con tarjeta ya cobrada). Mismos
   campos que la compra con tarjeta.

Otros correos del banco no representan un movimiento de dinero y se
ignoran en silencio vía `isIgnorableQikEmail()` (recibe subject y,
opcionalmente, el body — necesario para detectar compras declinadas, que
comparten asunto con las aprobadas):

- Código CASH creado/vencido, estados de cuenta, recordatorio de fecha de pago.
- **"Contraseña de uso único para transacciones electrónicas"** — OTP para
  autorizar una compra, no es la transacción en sí.
- **"Cardholder Services Alert"** — alerta de límite de tarjeta (en
  español pese al asunto en inglés); duplica una compra que ya llega por
  su propio correo de "Usaste tu tarjeta…" — se ignora para no duplicar.
- Cualquier correo de compra con `"Estatus"` distinto de
  `Aprobada`/`Exitoso` (declinada, rechazada, etc.).

Estos tipos ignorables son la mayoría del volumen real de la bandeja
(bastante más de la mitad de los correos de Qik).

- **Fecha**: tres formatos según el tipo de correo, todos en AST (UTC-4
  fijo, RD no tiene horario de verano) — numérico `MM-DD-YYYY HH:MM
  AM/PM (AST)` (compras con tarjeta), español con hora
  (`DD monthname YYYY / HH:MM a.m./p.m.`), o español sin hora
  (`DD de mon YYYY`, mes abreviado). Sin hora explícita se usa mediodía
  para no cruzar el límite del día al convertir a UTC.
- **Monto**: casi siempre con prefijo `RD$`, pero la plantilla vieja de
  compras con tarjeta lo manda con solo `$` — `parseAmount()` acepta
  ambos.
- Si el asunto no coincide con ningún tipo transaccional reconocido, o le
  faltan campos mínimos, el parser devuelve `null`. El sync solo lo
  reporta como error si `isIgnorableQikEmail()` tampoco lo reconoce como
  ruido esperado.
- Duplicados: `gmail_message_id` es UNIQUE; el sync filtra los existentes
  antes de insertar y tolera la carrera entre dos syncs simultáneos
  (error 23505).
- **Duplicados cross-canal**: Qik a veces notifica el MISMO movimiento por
  dos correos con `gmail_message_id` distinto — p. ej. un pago de servicio
  hecho con tarjeta de débito genera un "Pago de servicio realizado" Y un
  "Usaste tu tarjeta…" para la misma factura (bug real: Harold terminó con
  "Electricidad / Edeeste" RD$1,238.43 duplicado como "EDEESTE 8184", sin
  forma de eliminarlo desde la UI — corregido el 2026-07-04). Antes de
  insertar, `runSync()` verifica si ya existe una transacción con el mismo
  `amount` + `date` (timestamp exacto) + `type`; si existe, omite el
  insert. El riesgo de falso positivo (dos compras distintas con monto Y
  segundo exactos iguales) es prácticamente nulo.
- **Backfill puntual**: `GET /api/sync?days=N` corre el sync con una
  ventana más amplia que el default de 7 días — útil una sola vez tras
  arreglar un bug de parseo o agregar un remitente, para recuperar el
  historial que se perdió. `fetchQikEmails()` pagina y limita la
  concurrencia al pedir el detalle de cada correo (Gmail responde 429
  "too many concurrent requests" si se disparan todos a la vez — solo se
  nota con ventanas largas, el día a día trae pocos correos).

Tests: `src/lib/qik-parser.test.ts`, con fixtures HTML tomados de correos
reales (nombre/cédula ya enmascarados por el propio Qik). **Si Qik agrega
un tipo de correo nuevo, añade el correo real como caso de test y un nuevo
builder en `qik-parser.ts` — no adivines el formato.**

## Variables de entorno

Copia `.env.example` a `.env.local`. En Vercel se configuran en
Project Settings → Environment Variables.

| Variable | Qué es | Dónde se obtiene |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Key pública (no se usa en runtime; RLS bloquea todo) | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Key de servidor — **secreta** | Supabase → Settings → API |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | OAuth2 client | Google Cloud Console (abajo) |
| `GMAIL_REFRESH_TOKEN` | Token de larga vida | OAuth Playground (abajo) |
| `GOOGLE_USER_EMAIL` | Cuenta Gmail que recibe los correos de Qik | harold3112@gmail.com |
| `GMAIL_PUBSUB_TOPIC` | Tópico de Cloud Pub/Sub para Gmail Push | Google Cloud Console (§ Gmail Push) |
| `GMAIL_WEBHOOK_AUDIENCE` | URL pública de /api/gmail-webhook, valida el JWT de Pub/Sub | Tu dominio de Vercel |
| `GEMINI_API_KEY` | API key de Gemini | https://aistudio.google.com/apikey |
| `SYNC_SECRET` | Protege /api/sync (llamadas externas manuales) | `openssl rand -hex 32` |
| `CRON_SECRET` | Protege /api/gmail-watch/renew — **debe llamarse así**, Vercel lo inyecta automáticamente en sus crons | `openssl rand -hex 32` |
| `SESSION_SECRET` | Firma la cookie JWT de sesión | `openssl rand -base64 32` |

## Configurar Gmail API (OAuth2)

1. En [Google Cloud Console](https://console.cloud.google.com) crea un
   proyecto ("peso") y habilita **Gmail API** (APIs & Services → Library).
2. Configura la **OAuth consent screen**: tipo *External*, añade tu cuenta
   (harold3112@gmail.com) como *test user*. Scope necesario:
   `https://www.googleapis.com/auth/gmail.readonly`.
3. Crea credenciales **OAuth client ID** tipo *Web application* y agrega
   `https://developers.google.com/oauthplayground` como redirect URI
   autorizado. Guarda el Client ID y Client Secret.
4. Obtén el refresh token en el [OAuth Playground](https://developers.google.com/oauthplayground):
   - ⚙️ → marca *Use your own OAuth credentials* y pega tu client ID/secret.
   - En Step 1 escribe el scope `https://www.googleapis.com/auth/gmail.readonly`
     y autoriza con harold3112@gmail.com.
   - En Step 2 pulsa *Exchange authorization code for tokens* y copia el
     **Refresh token**.
5. Rellena `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` y `GMAIL_REFRESH_TOKEN`.

> La app queda en modo "Testing" en Google: los refresh tokens de test users
> expiran a los 7 días **salvo** que publiques la app (Publishing status →
> In production). Publícala aunque no la verifiques: para gmail.readonly con
> tu propia cuenta funciona y el token no expira.

## Configurar Gmail Push (sync automático en tiempo real)

Gmail no llama directamente a tu app — te avisa a través de un tópico de
**Cloud Pub/Sub**. El flujo completo: Gmail detecta un correo nuevo → publica
en el tópico → Pub/Sub hace `POST` a `/api/gmail-webhook` → la app llama a
`runSync()`. Esto es opcional: sin configurarlo, el sync manual (botón /
pull-to-refresh / `GET /api/sync`) sigue funcionando exactamente igual.

Todo esto se configura una sola vez, en el mismo proyecto de Google Cloud
que ya creaste para Gmail API:

1. **Habilita Cloud Pub/Sub API**: Google Cloud Console → APIs & Services →
   Library → busca "Cloud Pub/Sub API" → Enable.
2. **Crea un tópico**: Pub/Sub → Topics → Create Topic. ID sugerido:
   `qik-sync`. Copia el nombre completo, algo como
   `projects/peso-123456/topics/qik-sync` → eso es `GMAIL_PUBSUB_TOPIC`.
3. **Dale permiso a Gmail para publicar**: en el tópico → Permissions → Add
   principal → `gmail-api-push@system.gserviceaccount.com` → rol
   **Pub/Sub Publisher**. Sin este paso Gmail no puede notificar al tópico
   (falla en silencio, no da error visible).
4. **Crea la suscripción push**: Pub/Sub → el tópico → Create Subscription.
   - Delivery type: **Push**.
   - Endpoint URL: `https://tu-dominio.vercel.app/api/gmail-webhook`
     (el dominio real de tu deploy en Vercel).
   - Marca **"Enable authentication"** → Service account: puedes crear uno
     nuevo (IAM → Service Accounts → Create) o reusar uno existente con
     permiso mínimo. Audience: pon la misma URL del endpoint — ese valor
     exacto va en `GMAIL_WEBHOOK_AUDIENCE`.
   - Ack deadline: súbelo a 60s (el default de 10s puede ser justo si hay
     varios correos nuevos a la vez).
5. **Despliega la app** con `GMAIL_PUBSUB_TOPIC`, `GMAIL_WEBHOOK_AUDIENCE`
   y `CRON_SECRET` configurados en Vercel (Production).
6. **Activa la suscripción por primera vez**: llama una vez a
   ```
   curl https://tu-dominio.vercel.app/api/gmail-watch/renew \
     -H "Authorization: Bearer <CRON_SECRET>"
   ```
   Esto ejecuta `users.watch()` y arranca el monitoreo. A partir de ahí, el
   cron diario (`vercel.json`, 6am) lo renueva solo antes de que expire
   (máximo 7 días).

**Cómo depurar si no llegan notificaciones**: revisa Pub/Sub → tu tópico →
pestaña "Subscriptions" → busca métricas de mensajes entregados/fallidos.
Un 401 en los logs de `/api/gmail-webhook` casi siempre es
`GMAIL_WEBHOOK_AUDIENCE` mal configurado (debe ser idéntico, carácter por
carácter, al "Audience" que pusiste en la suscripción). El sync manual
sigue disponible como red de respaldo mientras depuras esto.

## Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (región us-east-1
   es la más cercana a RD).
2. En **SQL Editor** ejecuta `supabase/migrations/0001_init.sql` y luego
   `supabase/seed.sql`.
3. Copia URL y keys a `.env.local`.

**RLS**: todas las tablas tienen RLS habilitado **sin policies**. Es
intencional — el único acceso es del servidor con la service role key
(que ignora RLS); la anon key no puede leer nada. No agregues policies
salvo que cambies el modelo de acceso.

## Passkeys (Face ID)

No se usa Supabase Auth: Supabase no soporta passkeys como método primario.
En su lugar:

- `@simplewebauthn/server` genera/verifica los challenges (rutas en
  `src/app/api/auth/`); las credenciales se guardan en la tabla
  `webauthn_credentials`.
- Al verificar, se emite un JWT (jose, HS256 con `SESSION_SECRET`) en la
  cookie httpOnly `peso_session` (30 días). El middleware la valida en edge.
- **Primer uso**: si no existe ningún passkey, el botón de login crea uno
  (registro abierto solo mientras la tabla está vacía; después, añadir otro
  dispositivo requiere sesión activa).
- WebAuthn exige HTTPS o localhost. El RP ID se deriva del host de la
  request, así que funciona igual en localhost y en el dominio de Vercel —
  pero los passkeys registrados en un dominio no sirven en otro.
- En iPhone Safari, el flujo dispara Face ID automáticamente.

### Re-bloqueo automático (app lock)

La cookie de sesión dura 30 días — sin esto, Face ID solo se pediría una
vez y la PWA quedaría desbloqueada indefinidamente. `AppLockGate`
(`src/components/app-lock-gate.tsx`) añade una capa encima, puramente en
el cliente, que vuelve a pedir el passkey:

- Siempre que la PWA se abre desde cero (proceso matado por iOS y
  reabierto — el estado de React no sobrevive eso).
- Al volver de segundo plano si pasaron más de 30s desde la última vez que
  se verificó (`INACTIVITY_THRESHOLD_MS` en `src/lib/app-lock.ts`).

Mecanismo: `sessionStorage["peso-last-auth"]` guarda cuándo fue la última
verificación exitosa. `useLayoutEffect` lo revisa en el montaje (evita el
flash de contenido sin bloquear que daría un `useEffect` normal) y en cada
evento `visibilitychange`. El overlay de bloqueo (`LockScreen`) reusa el
mismo flujo WebAuthn que `/login` (`verifyPasskey()` en
`src/lib/webauthn-client.ts`) — la re-verificación también refresca el JWT
de sesión, así que renueva los 30 días sin fricción extra.

`AppLockGate` recibe `enabled={isSupabaseConfigured()}` desde el layout
server-side de `(app)`: en modo demo (sin Supabase) no hay passkeys que
verificar, así que nunca bloquea. `sessionStorage` (no `localStorage`) es
intencional: se limpia solo cuando el proceso muere, que es justo la señal
de "cerraron la PWA de verdad" que activa el bloqueo por el `useState(false)`
inicial del gate.

## Decisiones técnicas

- **Sin `googleapis`**: el cliente Gmail usa `fetch` directo (3 endpoints);
  el SDK oficial pesa ~100 MB y empeora el cold start de las functions.
- **Gemini vía REST con fallo suave**: si Gemini falla o inventa una
  categoría, la transacción se guarda sin sugerencia — el sync nunca se cae
  por la IA. Respuesta forzada a JSON (`responseMimeType`) y validada con Zod.
- **Service role en el servidor + RLS cerrado** en vez de anon key + policies:
  app de un usuario, sin acceso directo desde el browser a Supabase.
- **Datos mock automáticos** sin env vars: permite desarrollo de UI y QA
  visual sin credenciales.
- **Gmail Push en vez de polling.** Un cron de Vercel cada pocos minutos
  requiere plan Pro; sondear Gmail a cada rato además desperdicia quota de
  API para una sola cuenta. Gmail Push (Cloud Pub/Sub) notifica en
  segundos y el único cron que corre es 1x/día (gratis en Hobby) para
  renovar la suscripción. El costo es configuración manual en Google
  Cloud Console (topic + IAM + subscription) — ver § Gmail Push. El sync
  manual (botón, pull-to-refresh, `GET /api/sync`) queda como respaldo si
  el webhook falla o mientras configuras todo por primera vez.
- **`loading.tsx` por ruta en vez de spinners manuales.** Next.js App
  Router activa el archivo `loading.tsx` de cada segmento automáticamente
  vía Suspense mientras el server component espera datos — no hay que
  encablar estado de carga a mano en cada pantalla. `useLinkStatus()` en
  `BottomNav` da feedback aún más inmediato (opacidad reducida en el ícono
  tocado) para el instante entre el tap y que aparezca el skeleton.
- **PWA a mano** (manifest + sw.js simple) en vez de next-pwa/serwist:
  la app es dinámica, un SW network-first basta para instalabilidad iOS.
- **El Service Worker nunca intercepta navegación (`request.mode ===
  "navigate"`).** Bug real (corregido el 2026-07-04): la versión anterior
  clonaba y cacheaba la respuesta de cada navegación — Next.js App Router
  resuelve cada `loading.tsx`/Suspense boundary mandando el HTML en chunks
  progresivos sobre la MISMA response, y el `event.respondWith()` +
  `.clone()` del SW rompía ese streaming; el navegador se quedaba
  mostrando el skeleton para siempre, el contenido real nunca llegaba a
  pintarse. Como Peso es 100% dinámica (`force-dynamic` en cada página),
  cachear HTML de navegación tampoco tenía sentido — la próxima visita
  siempre debe traer datos frescos. `public/sw.js` ahora deja pasar
  `navigate` sin tocarlo; solo cachea estáticos (`/_next/static/`,
  `/icons/`), que no tienen este problema de streaming.
- **Montos**: siempre `RD$ X,XXX.XX` vía `formatMoney` (`src/lib/format.ts`).
  `amount` se guarda positivo; el signo lo da `type`.

## Deploy en Vercel

1. `vercel` (o conecta el repo en el dashboard). Framework: Next.js.
2. Configura todas las env vars (Production), incluido `CRON_SECRET` si
   quieres que el cron de renovación de Gmail Push funcione.
3. Si vas a usar Gmail Push, sigue § Gmail Push arriba **después** del
   primer deploy (necesitas la URL real de producción para el webhook).
4. QA en iPhone: abre el dominio en Safari → Compartir → *Agregar a inicio*.
   Verifica Face ID en el login, instalación standalone y safe areas.
