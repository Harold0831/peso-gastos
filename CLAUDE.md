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
├── middleware.ts            # Protege todo excepto /login, /api/auth, /api/sync
├── app/
│   ├── layout.tsx           # Fuente Inter, meta PWA, theme script
│   ├── manifest.ts          # Web manifest (→ /manifest.webmanifest)
│   ├── login/               # Login con passkey (WebAuthn)
│   ├── (app)/               # Shell con BottomNav — pantallas principales
│   │   ├── page.tsx         # 1. Dashboard: balance, pills, donut, recientes
│   │   ├── transactions/    # 2. Lista con filtros + 3. detalle/confirmar
│   │   │   └── new/         #    Alta manual (FAB central) — RHF + Zod
│   │   ├── charts/          # 4. Gráficas (Recharts) con selector de mes
│   │   ├── budget/          # 5. Presupuestos por categoría
│   │   └── goals/           # 6. Metas de ahorro con abonos
│   └── api/
│       ├── auth/            # register/login options+verify, logout (WebAuthn)
│       └── sync/            # GET protegido con Bearer SYNC_SECRET
├── lib/
│   ├── data.ts              # Lecturas (Supabase o mock si no hay env)
│   ├── actions.ts           # Server actions de mutación (confirmar, crear…)
│   ├── schemas.ts           # Schemas Zod compartidos
│   ├── sync.ts              # Pipeline Gmail → parser → Gemini → Supabase
│   ├── qik-parser.ts        # Parser de correos Qik (puro, con tests)
│   ├── gmail.ts             # Cliente Gmail REST (fetch + refresh token)
│   ├── gemini.ts            # Categorización con gemini-2.0-flash
│   ├── supabase.ts          # Cliente admin (service role, solo servidor)
│   ├── session.ts           # JWT de sesión con jose (corre en edge)
│   └── webauthn.ts          # Credenciales passkey en Supabase
├── components/              # BottomNav, TxRow, Donut, PullToRefresh…
supabase/
├── migrations/0001_init.sql # Tablas + RLS
└── seed.sql                 # Categorías por defecto
public/sw.js                 # Service worker (network-first)
design/                      # Referencias visuales (no es código de la app)
```

### Flujo de datos

- **Lecturas**: server components → `lib/data.ts` → Supabase con service
  role key. Todas las páginas son `force-dynamic` (datos cambian a cada sync).
- **Mutaciones**: client components → server actions (`lib/actions.ts`) →
  validación Zod → Supabase → `revalidatePath`.
- **Sync**: manual, desde el botón "Sincronizar" (ícono refresh) y el
  pull-to-refresh de /transactions → server action `syncNow` → `runSync()`.
  El botón muestra spinner, se deshabilita mientras carga y reporta
  "X nuevas transacciones" o el error. También existe `GET /api/sync`
  (Bearer SYNC_SECRET) para dispararlo desde fuera (curl, atajos de iOS…).

## Parser de correos Qik

Los correos llegan de `ayuda@qik.com.do`. Formato típico del cuerpo
(HTML o texto; el parser convierte HTML a texto y tolera valores en la
misma línea o en la línea siguiente, como en tablas):

```
Localidad: SUPERMERCADO NACIONAL
Fecha y hora: 05-06-2026 02:32 PM (AST)
Monto: RD$ 2,840.50
Balance Disponible: RD$ 48,210.35
```

- **Fecha**: formato `MM-DD-YYYY HH:MM AM/PM (AST)`. AST = UTC-4 fijo
  (RD no tiene horario de verano); se convierte a UTC al guardar.
- **Tipo**: asunto con "transacción"/"compra"/"consumo"/"retiro"/"pago" →
  gasto; "transferencia recibida"/"depósito" → ingreso; si el asunto es
  ambiguo se refuerza con el cuerpo. Default: gasto.
- **Tarjeta**: últimos 4 dígitos desde "terminada en NNNN", "**** NNNN" o
  "tarjeta NNNN" en asunto o cuerpo. Nullable (transferencias no traen).
- Si faltan comercio, monto o fecha, el parser devuelve `null` y el sync
  registra el error sin insertar (correos no transaccionales se ignoran así).
- Duplicados: `gmail_message_id` es UNIQUE; el sync filtra los existentes
  antes de insertar y tolera la carrera entre dos syncs simultáneos
  (error 23505).

Tests: `src/lib/qik-parser.test.ts` (27 casos). **Si Qik cambia el formato
de sus correos, actualiza el parser y añade el correo real como caso de test.**

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
| `GEMINI_API_KEY` | API key de Gemini | https://aistudio.google.com/apikey |
| `SYNC_SECRET` | Protege /api/sync para llamadas externas | `openssl rand -hex 32` |
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
- **Sync manual, sin cron.** El sync se dispara solo desde el botón de
  /transactions (o el pull-to-refresh). Se descartó el cron de Vercel:
  cada 5 min requiere plan Pro y para un solo usuario sincronizar al abrir
  la app es suficiente. Si algún día quieres automatizarlo, `GET /api/sync`
  con `Authorization: Bearer <SYNC_SECRET>` sigue disponible para un
  scheduler externo.
- **PWA a mano** (manifest + sw.js simple) en vez de next-pwa/serwist:
  la app es dinámica, un SW network-first basta para instalabilidad iOS.
- **Montos**: siempre `RD$ X,XXX.XX` vía `formatMoney` (`src/lib/format.ts`).
  `amount` se guarda positivo; el signo lo da `type`.

## Deploy en Vercel

1. `vercel` (o conecta el repo en el dashboard). Framework: Next.js.
2. Configura todas las env vars (Production).
3. QA en iPhone: abre el dominio en Safari → Compartir → *Agregar a inicio*.
   Verifica Face ID en el login, instalación standalone y safe areas.
