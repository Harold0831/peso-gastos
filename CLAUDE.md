# Peso — Finanzas personales (PWA)

App de rastreo de gastos e ingresos, **multi-usuario**. Cada usuario entra
con su cuenta de Google y puede vincular su Gmail para que Peso importe
automáticamente las notificaciones de transacciones de sus bancos (Qik,
Banco Popular, Banco Caribe, Scotiabank, BHD — elegibles por usuario en
/profile), las categorice con Gemini y las presente en una PWA
móvil instalable en iPhone. Creada por Harold, desplegada en Vercel,
pensada para él y sus amigos (máx. 100 usuarios — ver § Configurar Google).

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
Con Supabase configurado, el middleware exige sesión (login con Google).

## Arquitectura

```
src/
├── middleware.ts             # Protege todo excepto /login, /api/auth, /api/sync, /api/gmail-*, /api/voice-entry, /api/admin
├── app/
│   ├── layout.tsx            # Fuente Inter, meta PWA, theme script
│   ├── manifest.ts           # Web manifest (→ /manifest.webmanifest)
│   ├── login/                # "Continuar con Google"
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
│   │   ├── goals/            # 6. Metas de ahorro: abonar, retirar, editar
│   │   │   └── loading.tsx
│   │   ├── profile/          # 7. Perfil: Gmail, Face ID, feedback, logout
│   │   │   └── loading.tsx
│   │   └── notifications/    # 8. Bandeja (campanita): derivada del estado,
│   │       └── loading.tsx   #    ver getAttentionItems() — sin tabla propia
│   └── api/
│       ├── auth/google/        # GET inicia OAuth; callback crea usuario+sesión
│       ├── auth/…              # register/login options+verify (passkey del
│       │                       #   app-lock), logout
│       ├── sync/               # GET Bearer SYNC_SECRET — sincroniza a TODOS
│       ├── gmail-webhook/      # POST — push de Gmail, sincroniza al dueño del buzón
│       ├── gmail-watch/renew/  # GET Bearer CRON_SECRET — renueva watch de todos
│       ├── voice-entry/        # POST Bearer <token> — captura desde Shortcut de iOS
│       └── admin/mint-token/   # POST Bearer ADMIN_SECRET — genera token de un usuario
├── lib/
│   ├── data.ts             # Lecturas, acotadas al usuario en sesión
│   ├── actions.ts          # Server actions de mutación, acotadas al usuario
│   ├── banks.ts            # Catálogo de bancos (ids/nombres) — client-safe
│   ├── exchange-rate.ts    # Tasa USD→DOP con cache diaria (tabla exchange_rates)
│   ├── api-token.ts        # Tokens de API por usuario (hash SHA-256) para el Shortcut
│   ├── users.ts            # upsert desde Google, gmail_accounts, requireUserId()
│   ├── google-oauth.ts     # Authorization code flow + verificación de id_token
│   ├── crypto.ts           # AES-256-GCM para refresh tokens en la DB
│   ├── schemas.ts          # Schemas Zod compartidos
│   ├── sync.ts             # runSyncForUser / runSyncForGmailAddress / runSyncAll
│   ├── bank-parser.ts      # Registro de bancos: remitentes + dispatcher por From
│   ├── qik-parser.ts       # Parser Qik (5 tipos; exporta htmlToText compartido)
│   ├── popular-parser.ts   # Parser Banco Popular (6 tipos, tablas columnares)
│   ├── caribe-parser.ts    # Parser Banco Caribe (1 tipo confirmado, multi-moneda)
│   ├── scotiabank-parser.ts # Parser Scotiabank (5 tipos; fecha del receivedAt)
│   ├── bhd-parser.ts       # Parser BHD (2 tipos; ignora estados "en proceso")
│   ├── gmail.ts             # Cliente Gmail REST (recibe refresh token por usuario)
│   ├── gmail-webhook.ts     # Verificación del JWT de Pub/Sub push
│   ├── gemini.ts             # Categorización con gemini-2.0-flash
│   ├── supabase.ts           # Cliente admin (service role, solo servidor)
│   ├── session.ts            # JWT de sesión (sub = user_id) con jose, corre en edge
│   ├── webauthn.ts           # Passkeys por usuario (app-lock)
│   ├── webauthn-client.ts    # verifyPasskey() — usado por LockScreen
│   └── app-lock.ts           # Umbral de re-bloqueo (sessionStorage)
├── components/                # BottomNav, TxRow, Donut, PullToRefresh, Skeleton,
│                               # AppLockGate + LockScreen (re-bloqueo con Face ID),
│                               # Toast (feedback de mutaciones), Dismissible
│                               # (banners descartables), OnboardingCard
supabase/
├── migrations/0001_init.sql # Tablas base + RLS
├── migrations/0002_...sql   # Soft delete de transacciones
├── migrations/0003_...sql   # Multi-usuario: users, gmail_accounts, user_id, feedback
├── migrations/0004_...sql   # Multi-moneda (exchange_rates, exchange_rate) + enabled_banks
├── migrations/0005_...sql   # api_tokens, transactions.source, users.home_currency
├── migrations/0006_...sql   # push_subscriptions (Web Push por dispositivo)
├── migrations/0007_...sql   # notification_dismissals (descartes de la bandeja)
├── migrations/0008_...sql   # categories.user_id (personalizadas por usuario)
├── migrations/0009_...sql   # users.opening_balance (saldo disponible persistente)
├── migrations/0010_...sql   # recurring_expenses + recurring_payments (gastos fijos)
└── seed.sql                 # Categorías por defecto (globales, user_id null)
public/sw.js                 # Service worker (solo estáticos, nunca navegación)
design/                      # Referencias visuales (no es código de la app)
```

### Flujo de datos

- **Multi-usuario**: cada fila de transactions/budgets/savings_goals/
  webauthn_credentials tiene `user_id`. **Toda** lectura y mutación en
  `data.ts`/`actions.ts` filtra por `requireUserId()` (el user_id del JWT
  de sesión) — no hay RLS policies porque el único cliente es el servidor
  con service role; el aislamiento entre usuarios vive en el código, así
  que cualquier query nueva DEBE incluir el filtro de user_id. Las
  categorías globales (seed, `user_id` null) son compartidas y de solo
  lectura; cada usuario puede además crear las suyas (ver Categorías).
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
- **`deleteTransaction` es soft delete** (columna `deleted_at`, migración
  `0002`), no un DELETE real. Bug real (corregido el 2026-07-05): al
  borrar la fila de verdad, el próximo sync (webhook o manual) volvía a
  encontrar el correo en Gmail, no lo veía en la tabla, y lo re-insertaba
  — la transacción "eliminada" reaparecía sola después de un rato. Todas
  las lecturas (`getTransactions`, `getTransactionById`, `getPendingCount`)
  filtran `deleted_at is null`; los chequeos de duplicados en `runSync()`
  (por `gmail_message_id` y por monto+fecha+tipo) **no** filtran
  `deleted_at` a propósito, para seguir reconociendo el correo como ya
  procesado aunque el usuario lo haya borrado de la vista.
- **Multi-moneda (migración `0004`)**: `amount` SIEMPRE se guarda en su
  moneda original (`currency`: `"DOP" | "USD"`, union type en `types.ts`);
  nunca se convierte al guardar. La conversión vive en dos lugares: (a) al
  sincronizar/crear, se estampa `exchange_rate` (pesos por 1 USD, tasa del
  día) en la transacción; (b) al agregar (`data.ts` → `dopConverter()`),
  los totales/gráficas/presupuestos multiplican por esa tasa — las filas
  USD viejas sin tasa (pre-0004) caen a la última cacheada. La tasa del
  día viene de `exchange-rate.ts`: cache diaria en la tabla
  `exchange_rates` (1 consulta externa por día para toda la app),
  proveedor actual open.er-api.com (sin API key); BCRD pendiente (issue
  #1, requiere registro en su portal — NO adivinar su formato). Fallo
  suave estilo Gemini: sin tasa, la transacción se inserta igual con
  `exchange_rate` null. La UI muestra `US$`/`RD$` según `currency`
  (`formatMoney(amount, currency)`) y el detalle agrega "≈ RD$ …" con la
  tasa estampada.
- **Moneda de casa por usuario** (`users.home_currency`, migración
  `0005`): la moneda en la que un usuario ve sus totales/gráficas/
  presupuestos. Default `DOP` (nadie cambia). `data.ts` → `getHomeCurrency()`
  (cacheado por request con `react.cache`) + `homeConverter()`: las
  transacciones ya en la moneda de casa pasan sin conversión (un usuario
  100% EUR o 100% DOP no convierte nada), las demás usan `exchange_rate`.
  Las páginas de agregación (dashboard, charts, budget, goals) reciben la
  moneda de casa y la pasan a `formatMoney`. La lista de transacciones y el
  detalle siguen mostrando cada fila en SU moneda original (`tx.currency`),
  no en la de casa — son cosas distintas.
- **Captura por voz — Shortcut de iOS** (`POST /api/voice-entry`, migración
  `0005`): registra gastos sin sesión interactiva (un Shortcut no puede
  hacer el flujo OAuth de Google). Auth por **token** de API por usuario
  (`api-token.ts`): secreto largo aleatorio que vive en el Shortcut, en la
  DB solo su **hash SHA-256** (tabla `api_tokens`). El token se genera con
  `POST /api/admin/mint-token` (Bearer `ADMIN_SECRET`, busca al usuario por
  email — que ya debe haber entrado a la app — y opcionalmente fija su
  `home_currency`). Dos modos: `quick` (`{category, amount, description?}`,
  inserta directo) y `dictate` (`{text}` → `parseVoiceEntry` en `gemini.ts`
  extrae monto/descripción/categoría de habla natural; sin monto claro
  devuelve 422 para que repita). Ambos: moneda = la de casa del usuario,
  fecha = hoy, `confirmed=true`, `source='voice'`. Blast radius de un token
  filtrado: bajo — el endpoint solo INSERTA transacciones de ese usuario.
- **`transactions.source`** (migración `0005`): `'email'` (parsing de
  correos), `'manual'` (alta web) o `'voice'` (Shortcut). NULL en filas
  anteriores a la migración.
- **Bancos por usuario** (`gmail_accounts.enabled_banks`, migración
  `0004`): array de ids del catálogo `banks.ts` (`qik`, `popular`,
  `caribe`, `scotiabank`, `bhd`); NULL = todos (default, nadie pierde
  sync). El perfil ("Mis bancos") los togglea vía `setEnabledBanks`;
  `runSyncForUser` pasa `sendersForBanks(enabled_banks)` a
  `fetchBankEmails` para acotar la búsqueda en Gmail. `banks.ts` existe
  separado de `bank-parser.ts` a propósito: la UI y los schemas Zod lo
  importan desde el cliente sin arrastrar los 5 parsers al bundle.
- **Categorías personalizadas por usuario** (`categories.user_id`,
  migración `0008`): `user_id` null = categoría global (las 9 del seed,
  compartidas y de solo lectura); con `user_id` = privada de ese usuario.
  `getCategories()` en `data.ts` devuelve globales + propias del usuario en
  sesión (`.or(user_id.is.null,user_id.eq.<uid>)`), así que TODO lo que ya
  consumía esa lista —alta manual, detalle, presupuestos, gráficas y la
  sugerencia de Gemini en `sync.ts`— muestra las personalizadas sin más
  cambios. El unique global sobre `name` se cambió por uno acotado al
  ámbito (`coalesce(user_id, centinela), name`) para que dos usuarios
  puedan tener "Mascota". CRUD en el perfil ("Mis categorías",
  `CategoryManager`) vía `createCategory`/`deleteCategory`: crear rechaza
  nombres que choquen con una categoría visible (case-insensitive);
  **borrar se bloquea si está en uso** — transacciones (guardan el nombre)
  o un presupuesto (FK con cascade que se perdería) — el usuario reasigna
  primero. Las globales nunca se editan ni se borran (el filtro por
  `user_id` lo impide).
- **Saldo disponible persistente** (`users.opening_balance` +
  `opening_balance_as_of`, migración `0009`): el número grande del dashboard
  ya NO es ingresos−gastos del mes (se reiniciaba a cero cada mes). Ahora es
  `getAvailableBalance()` = `opening_balance` + (ingresos − gastos de las
  transacciones POSTERIORES a `as_of`), en moneda de casa. Sin fijar nada
  (`opening_balance` 0, `as_of` null) sale el acumulado de TODO lo
  registrado. "Ajustar saldo" (`AdjustBalanceDialog` → `setOpeningBalance`)
  fija el saldo real de hoy (`as_of` = now): las transacciones previas quedan
  "dentro" de ese número y solo las nuevas lo mueven. Los pills de
  Ingresos/Gastos siguen siendo mensuales.
- **Gastos fijos / pagos recurrentes** (`recurring_expenses` +
  `recurring_payments`, migración `0010`): distinto de un presupuesto (techo
  por categoría) — es un pago concreto que se repite (alquiler, Netflix, la
  luz) y quieres saber si ya lo pagaste este mes. `getRecurringForMonth()`
  resuelve cada gasto fijo a pagado/pendiente: (1) si hay un override manual
  en `recurring_payments` para ese mes lo usa; si no (2) **auto-detecta** —
  hay una transacción de gasto confirmada este mes cuyo comercio contiene el
  nombre del gasto fijo (`matchesRecurring`). El toggle en /recurring
  (`setRecurringPaid`) escribe el override — `paid` para marcar algo que Peso
  no detectó (p. ej. efectivo), `pending` para deshacer un auto-match
  equivocado. Pantalla `/recurring` + tarjeta en el dashboard ("N/M pagados
  este mes"). CRUD vía `createRecurringExpense`/`deleteRecurringExpense`;
  borrar no toca transacciones.
- **Metas: abonar, retirar y editar.** Al principio solo existía "Abonar"
  (sumar), lo que dejaba callejones sin salida: si el usuario gastaba parte
  de lo ahorrado no podía reflejarlo, y una meta ya completada se quedaba
  sin ninguna acción posible (ni siquiera borrarla). Hoy hay tres
  mutaciones más: `withdrawFromGoal` (resta, nunca por debajo de 0 —
  valida contra el ahorro real en el servidor), `updateGoal` (nombre,
  ícono, objetivo, fecha y **`current_amount`**, que admite 0 vía
  `nonNegativeAmountField`) y `deleteGoal` (borrado real: una meta no
  reaparece desde Gmail, así que no necesita soft delete). En la tarjeta:
  "+ Abonar" solo si falta para el objetivo, "− Retirar" solo si hay algo
  ahorrado, y ✏️ siempre. Todas revalidan `/goals` **y** `/` con
  `revalidateGoals()` — el dashboard muestra el conteo de metas activas y
  se quedaba desactualizado.
- **Confirmación en lote** (`confirmTransactionsBulk`): en /transactions,
  filtro "Por confirmar" → "Seleccionar varias" activa checkboxes en
  `TxRow` (prop `selectable`). Si 2+ pendientes comparten la misma
  `ai_suggested_category`, aparece un atajo "N sugeridas como X" que las
  selecciona todas y precarga esa categoría de un tap — pensado para el
  caso de varias transacciones similares seguidas (p. ej. varios
  "PedidosYa" sugeridos como "Alimentación").
- **Sync automático**: los watches de Gmail de TODOS los usuarios publican
  al mismo tópico de Cloud Pub/Sub. El push a `POST /api/gmail-webhook`
  trae en su payload el `emailAddress` del buzón que cambió →
  `runSyncForGmailAddress()` sincroniza solo a ese usuario. Cada watch
  expira a los 7 días máximo; el cron diario de `vercel.json` (`GET
/api/gmail-watch/renew`, Bearer `CRON_SECRET`) los renueva todos. Al
  vincular Gmail (callback de OAuth) el watch se activa de inmediato y se
  corre el primer sync, sin esperar al cron.
- **Sync manual (fallback)**: botón "Sincronizar" y pull-to-refresh de
  /transactions → server action `syncNow` → `runSyncForUser(usuario en
sesión)`. `GET /api/sync` (Bearer `SYNC_SECRET`) sincroniza a todos los
  usuarios — para curl/atajos externos o backfills (`?days=N`).
- **Tokens revocados**: si un usuario quita el acceso desde su cuenta de
  Google, el refresh falla con `invalid_grant` → `GmailAuthError` →
  `gmail_accounts.sync_enabled=false`. El dashboard y el perfil muestran
  "reconectar Gmail" y los crons dejan de intentar con esa cuenta.

## Parsers de correos bancarios

`bank-parser.ts` es el registro de bancos soportados: cada banco define
sus remitentes, su `parse()` y su `isIgnorable()`. El filtro de búsqueda
en Gmail se arma con TODOS los remitentes del registro — un remitente que
no esté ahí nunca se sincroniza. **Para agregar un banco: consigue 2+
correos reales (no adivines el formato — falló dos veces con Qik), crea su
`<banco>-parser.ts` con fixtures en tests, y regístralo.**

Bancos soportados (2026-07-05): **Qik** (5 tipos), **Banco Popular**
(6 tipos — remitente `notificaciones@popularenlinea.com`, tablas
COLUMNARES: etiquetas primero y valores después, fechas en D/M/YYYY,
D/M/YY y YYYYMMDD según el tipo, montos `RD$`/`RD $`/`RD` a secas),
**Banco Caribe** (1 tipo confirmado — `notificaciones@bancocaribe.com.do`,
campos inline, monto SIN prefijo con la moneda en campo aparte — puede ser
USD — y fecha/hora con espacios: `24 / 06 / 2026`, `12 : 25 : 56`),
**Scotiabank** (5 tipos — `alertas@scotiabank.com`, prosa sin tabla;
**el cuerpo trae hora pero NO fecha** — la fecha sale del `receivedAt` del
correo, por eso los parsers reciben ese parámetro) y **BHD** (2 tipos —
`alertas@bhd.com.do`; "Pagos al Instante en Proceso" de
`notificaciones@bhd.com.do` se ignora a propósito: es un estado intermedio
que duplicaría la transferencia final). El detalle de cada formato vive
como doc comment en su parser.

### Qik

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

| Variable                                  | Qué es                                                                                                 | Dónde se obtiene                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                | URL del proyecto                                                                                       | Supabase → Settings → API           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`           | Key pública (no se usa en runtime; RLS bloquea todo)                                                   | Supabase → Settings → API           |
| `SUPABASE_SERVICE_ROLE_KEY`               | Key de servidor — **secreta**                                                                          | Supabase → Settings → API           |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | OAuth2 client — login con Google Y lectura de Gmail                                                    | Google Cloud Console (abajo)        |
| `TOKEN_ENCRYPTION_KEY`                    | Cifra los refresh tokens de Gmail en la DB (AES-256-GCM)                                               | `openssl rand -base64 32`           |
| `GMAIL_PUBSUB_TOPIC`                      | Tópico de Cloud Pub/Sub para Gmail Push                                                                | Google Cloud Console (§ Gmail Push) |
| `GMAIL_WEBHOOK_AUDIENCE`                  | URL pública de /api/gmail-webhook, valida el JWT de Pub/Sub                                            | Tu dominio de Vercel                |
| `GEMINI_API_KEY`                          | API key de Gemini                                                                                      | https://aistudio.google.com/apikey  |
| `SYNC_SECRET`                             | Protege /api/sync (llamadas externas manuales)                                                         | `openssl rand -hex 32`              |
| `ADMIN_SECRET`                            | Protege /api/admin/mint-token (genera el token de API de un usuario para el Shortcut de iOS)           | `openssl rand -hex 32`              |
| `CRON_SECRET`                             | Protege /api/gmail-watch/renew — **debe llamarse así**, Vercel lo inyecta automáticamente en sus crons | `openssl rand -hex 32`              |
| `SESSION_SECRET`                          | Firma la cookie JWT de sesión                                                                          | `openssl rand -base64 32`           |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (opcional): sin ellas la sección "Notificaciones" del perfil no aparece y nada más cambia | `npx web-push generate-vapid-keys`  |
| `VAPID_CONTACT_EMAIL`                     | Contacto que los servicios de push pueden usar si hay un problema con tus envíos (opcional; default placeholder) | Tu email                            |

## Configurar Google (login + Gmail multi-usuario)

Un solo OAuth client sirve para todo: "Continuar con Google" (identidad) y
el permiso `gmail.readonly` (importación de correos), pedidos en el mismo
consent. Los refresh tokens de cada usuario se guardan cifrados en la
tabla `gmail_accounts` — ya no hay token en env vars.

1. En [Google Cloud Console](https://console.cloud.google.com) crea un
   proyecto ("peso") y habilita **Gmail API** (APIs & Services → Library).
2. Configura la **OAuth consent screen**: tipo _External_. Scopes:
   `openid`, `email`, `profile` y
   `https://www.googleapis.com/auth/gmail.readonly`.
3. Crea credenciales **OAuth client ID** tipo _Web application_ con estos
   **redirect URIs autorizados** (los dos):
   - `https://tu-dominio.vercel.app/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (para dev local)
4. Rellena `GMAIL_CLIENT_ID` y `GMAIL_CLIENT_SECRET`.
5. **Publica la app** (OAuth consent screen → Publishing status →
   **In production**). Crítico: en modo "Testing" los refresh tokens
   expiran a los 7 días y el auto-sync de todos moriría semanalmente.

**Restricciones de Google al operar sin verificación formal** (verificar
`gmail.readonly` requiere una auditoría de seguridad anual — no tiene
sentido para una app de amigos):

- Cada usuario nuevo ve una pantalla **"Google no ha verificado esta app"**
  y debe tocar _Avanzado → Ir a peso (no seguro)_ para continuar. Avísales
  a tus amigos que esa pantalla es esperada.
- El checkbox de "leer tu correo" en el consent es **opcional** — si
  alguien lo desmarca, su cuenta se crea igual en modo manual y puede
  vincular Gmail después desde /profile.
- **Tope de 100 usuarios de por vida** del proyecto (no se resetea).
  De sobra para amigos; si algún día se supera, tocaría verificación formal.

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

Con multi-usuario, el passkey **ya no es el login** (eso es "Continuar con
Google") — es el **bloqueo opcional con Face ID** de cada usuario:

- Se activa desde /profile ("Activar Face ID"): registra un passkey del
  dispositivo ligado al `user_id` en `webauthn_credentials`.
- Las rutas `api/auth/register|login/*` requieren sesión activa; el
  "login/verify" del passkey no inicia sesión — la **renueva** (30 días
  más) para el mismo usuario tras verificar su identidad.
- La sesión es un JWT (jose, HS256 con `SESSION_SECRET`, `sub` = user_id)
  en la cookie httpOnly `peso_session`, emitida por el callback de Google.
  El middleware la valida en edge.
- WebAuthn exige HTTPS o localhost. El RP ID se deriva del host de la
  request — los passkeys registrados en un dominio no sirven en otro.
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

`AppLockGate` recibe `enabled` desde el layout server-side de `(app)`:
solo es `true` si el usuario en sesión tiene passkeys registrados — sin
passkey no hay nada que verificar y la app no bloquea (ni en modo demo).
`sessionStorage` (no `localStorage`) es intencional: se limpia solo cuando
el proceso muere, que es justo la señal de "cerraron la PWA de verdad" que
activa el bloqueo por el `useState(false)` inicial del gate.

## Decisiones técnicas

- **Sin `googleapis`**: el cliente Gmail usa `fetch` directo (3 endpoints);
  el SDK oficial pesa ~100 MB y empeora el cold start de las functions.
- **Gemini vía REST con fallo suave**: si Gemini falla o inventa una
  categoría, la transacción se guarda sin sugerencia — el sync nunca se cae
  por la IA. Respuesta forzada a JSON (`responseMimeType`) y validada con Zod.
- **Service role en el servidor + RLS cerrado** en vez de anon key +
  policies: el browser nunca toca Supabase directo; el aislamiento entre
  usuarios se aplica en código (`requireUserId()` en cada query). Si algún
  día hubiera acceso directo desde el cliente, habría que migrar a RLS
  policies por `user_id`.
- **Login con Google en vez de passkeys/magic links**: los usuarios van a
  vincular su Gmail de todos modos — un solo consent da identidad +
  permiso de lectura, cero fricción para amigos no técnicos. El passkey
  quedó como bloqueo local opcional (Face ID).
- **Refresh tokens cifrados en la DB** (AES-256-GCM, `lib/crypto.ts`):
  un refresh token da lectura del correo completo de esa persona — en
  texto plano, un dump de la DB sería un desastre. La clave vive solo en
  `TOKEN_ENCRYPTION_KEY` (env del servidor).
- **Datos mock automáticos** sin env vars: permite desarrollo de UI y QA
  visual sin credenciales.
- **Gmail Push en vez de polling.** Un cron de Vercel cada pocos minutos
  requiere plan Pro; sondear Gmail a cada rato además desperdicia quota de
  API. Gmail Push (Cloud Pub/Sub) notifica en segundos y el único cron que
  corre es 1x/día (gratis en Hobby) para renovar los watches de todos los
  usuarios. El costo es configuración manual en Google Cloud Console
  (topic + IAM + subscription) — ver § Gmail Push. El sync manual (botón,
  pull-to-refresh, `GET /api/sync`) queda como respaldo si el webhook
  falla o mientras configuras todo por primera vez.
- **Notificaciones push (Web Push + VAPID, migración `0006`)**: opcional —
  sin claves VAPID todo se apaga en silencio. `lib/push.ts` →
  `sendPushToUser()` (poda suscripciones muertas 404/410); handlers `push`
  y `notificationclick` en `public/sw.js`. Dos disparadores: (a) sync
  automático (webhook/cron, NO el manual — el usuario ya está mirando) →
  "N transacciones por confirmar"; (b) al CONFIRMAR un gasto (no al
  sincronizar: las pendientes no cuentan al presupuesto) si el gasto de la
  categoría cruzó el 80% o 100% del presupuesto — solo al cruzar el
  umbral, nunca repetido. Suscripción por dispositivo desde el perfil
  ("Notificaciones"); en iPhone requiere la PWA instalada (iOS 16.4+).
  Fallo suave en todo: una push jamás tumba un sync o una confirmación.
- **Convenciones de UX** (2026-07-18): toda mutación confirma con un toast
  (`useToast()`, provider en el layout de `(app)`) — nunca terminar una
  acción en silencio. Los banners promocionales/opcionales del dashboard
  (vincular Gmail, Face ID) son descartables con memoria (`Dismissible`,
  localStorage); el de "reconectar Gmail" NO es descartable a propósito
  (es una rotura real del sync). Estados vacíos siempre con acción (CTA o
  celebración), nunca un callejón sin salida. En el nav va Presupuesto
  (uso semanal) y Metas quedó como tarjeta del dashboard (uso esporádico).
  Errores de Supabase pasan por `friendlyDbError()` (mensaje humano en
  español; el crudo va a console.error para los logs de Vercel).
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
- **Montos**: `RD$ X,XXX.XX` o `US$ X.XX` según `currency`, vía
  `formatMoney(amount, currency)` (`src/lib/format.ts`, default DOP).
  `amount` se guarda positivo y en su moneda original; el signo lo da
  `type` y la conversión a RD$ para totales vive en `data.ts` (ver
  § Multi-moneda).

## Deploy en Vercel

1. `vercel` (o conecta el repo en el dashboard). Framework: Next.js.
2. Configura todas las env vars (Production), incluido `CRON_SECRET` si
   quieres que el cron de renovación de Gmail Push funcione.
3. Si vas a usar Gmail Push, sigue § Gmail Push arriba **después** del
   primer deploy (necesitas la URL real de producción para el webhook).
4. QA en iPhone: abre el dominio en Safari → Compartir → _Agregar a inicio_.
   Verifica el login con Google, instalación standalone y safe areas.

## Invitar amigos

No hay registro cerrado ni lista de invitados: cualquiera con el link
puede crear cuenta (hasta el tope de 100 usuarios de Google, ver
§ Configurar Google). Para invitar a alguien basta con:

1. Compartirle `https://tu-dominio.vercel.app`.
2. Avisarle que la pantalla "Google no ha verificado esta app" es normal —
   debe tocar _Avanzado → Continuar_.
3. Si usa Qik, que deje marcado el checkbox de lectura de correo en el
   consent; si no usa Qik, puede desmarcarlo y registrar gastos a mano.
4. Que instale la PWA (instrucciones dentro de la app, en /profile).

El feedback que envíen desde /profile queda en la tabla `feedback` de
Supabase (Table Editor → feedback) con su user_id y fecha.
