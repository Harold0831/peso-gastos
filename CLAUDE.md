# Peso — Finanzas personales (PWA)

App de rastreo de gastos e ingresos, **multi-usuario**. Cada usuario entra
con su cuenta de Google y puede vincular su Gmail para que Peso importe
automáticamente las notificaciones de transacciones de sus bancos (Qik,
Banco Popular, Banco Caribe, Scotiabank, BHD, Banreservas — elegibles por
usuario en /profile), las categorice con Gemini y las presente en una PWA
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
Con Supabase configurado, el middleware exige sesión (Google o correo).

## Arquitectura

```
src/
├── middleware.ts             # Protege todo excepto /login, /privacy, /terms, /api/auth, /api/sync, /api/gmail-*, /api/voice-entry, /api/admin
├── app/
│   ├── layout.tsx            # Fuente Inter, meta PWA, theme script
│   ├── manifest.ts           # Web manifest (→ /manifest.webmanifest)
│   ├── login/                # "Continuar con Google" + correo/contraseña
│   ├── (legal)/              # /privacy y /terms — PÚBLICAS (Google las exige)
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
│   │   ├── recurring/        # 7. Gastos fijos: checklist mensual de pagos
│   │   │   └── loading.tsx
│   │   ├── more/             # 8. "Más" (5º tab): índice de gestión con
│   │   │   └── loading.tsx   #    estado real de cada sección
│   │   ├── categories/       # 9. Categorías: crear/editar propias, eliminar
│   │   │   └── loading.tsx   #    las por defecto (+ restablecerlas)
│   │   ├── cards/            # 10. Tarjetas: gasto por tarjeta, con
│   │   │   └── loading.tsx   #     auto-descubrimiento desde card_last4
│   │   ├── profile/          # 11. Perfil: Gmail, bancos, contraseña,
│   │   │   └── loading.tsx   #     Face ID, push, tema (Apariencia)
│   │   └── notifications/    # 12. Bandeja (campanita): derivada del estado,
│   │       └── loading.tsx   #    ver getAttentionItems() — sin tabla propia
│   └── api/
│       ├── auth/google/        # GET inicia OAuth; callback crea usuario+sesión
│       ├── auth/email/         # POST register/login con correo y contraseña
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
│   ├── category-icons.ts   # Claves de los íconos de categoría — client-safe
│   ├── exchange-rate.ts    # Tasa USD→DOP con cache diaria (tabla exchange_rates)
│   ├── api-token.ts        # Tokens de API por usuario (hash SHA-256) para el Shortcut
│   ├── users.ts            # upsert desde Google, gmail_accounts, requireUserId()
│   ├── google-oauth.ts     # Authorization code flow + verificación de id_token
│   ├── crypto.ts           # AES-256-GCM para refresh tokens en la DB
│   ├── password.ts         # Hash de contraseñas con scrypt (login por correo)
│   ├── schemas.ts          # Schemas Zod compartidos
│   ├── sync.ts             # runSyncForUser / runSyncForGmailAddress / runSyncAll
│   ├── merchant-history.ts # Reglas puras de auto-confirmación por comercio
│   ├── auto-confirm.ts     # Lado servidor de esas reglas (historial + pendientes)
│   ├── budget-alert.ts     # Regla del aviso de presupuesto (compartida)
│   ├── failed-emails.ts    # Muestras cifradas de correos que el parser no supo leer
│   ├── bank-parser.ts      # Registro de bancos: remitentes + dispatcher por From
│   ├── qik-parser.ts       # Parser Qik (5 tipos; exporta htmlToText compartido)
│   ├── popular-parser.ts   # Parser Banco Popular (6 tipos, tablas columnares)
│   ├── caribe-parser.ts    # Parser Banco Caribe (1 tipo confirmado, multi-moneda)
│   ├── scotiabank-parser.ts # Parser Scotiabank (6 tipos; fecha del receivedAt)
│   ├── bhd-parser.ts       # Parser BHD (2 tipos; ignora estados "en proceso")
│   ├── banreservas-parser.ts # Parser Banreservas (3 tipos; bug de fecha 24h+PM)
│   ├── gmail.ts             # Cliente Gmail REST (recibe refresh token por usuario)
│   ├── gmail-webhook.ts     # Verificación del JWT de Pub/Sub push
│   ├── gemini.ts             # Categorización con gemini-2.0-flash
│   ├── supabase.ts           # Cliente admin (service role, solo servidor)
│   ├── session.ts            # JWT de sesión (sub = user_id) con jose, corre en edge
│   ├── webauthn.ts           # Passkeys por usuario (app-lock)
│   ├── webauthn-client.ts    # verifyPasskey() — usado por LockScreen
│   ├── app-lock.ts           # Umbral de re-bloqueo (sessionStorage)
│   └── theme.ts              # Preferencia de tema (claro/oscuro/sistema)
├── components/                # BottomNav, TxRow, Donut, PullToRefresh, Skeleton,
│                               # AppLockGate + LockScreen (re-bloqueo con Face ID),
│                               # Toast (feedback de mutaciones), Dismissible
│                               # (banners descartables), OnboardingCard,
│                               # ThemeScript (tema antes del 1er paint) +
│                               # ThemeToggle (selector en /profile)
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
├── migrations/0011_...sql   # hidden_categories (ocultar las por defecto)
├── migrations/0012_...sql   # cards (nombre a los card_last4 ya guardados)
├── migrations/0013_...sql   # users.password_hash (login con correo)
├── migrations/0014_...sql   # rate_limits + check_rate_limit() (freno por IP)
├── migrations/0015_...sql   # auto_confirmed + users.auto_confirm_enabled
├── migrations/0016_...sql   # categories.icon: de emoji a claves de SVG
├── migrations/0017_...sql   # failed_emails (muestras cifradas) + source 'ai'
├── migrations/0018_...sql   # deja de guardar raw_email_snippet (y lo vacía)
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
  que cualquier query nueva DEBE incluir el filtro de user_id.
  **Eso lo vigilan `data-isolation.test.ts` y `actions-isolation.test.ts`**,
  que son la única red bajo esa cuerda: un `createFakeSupabase()` (Proxy que
  GRABA las consultas en vez de ejecutarlas, así que no hace falta base de
  datos) recorre TODAS las funciones exportadas de `data.ts` y las 34 server
  actions, y falla si alguna toca una tabla por usuario sin acotarla — por
  `.eq("user_id", …)`, por el `.or(…)` de categorías, o porque el payload del
  insert lleva el `user_id`. Tres guardas evitan que el test se vuelva
  decorativo: (1) **cobertura** — si exportas una función nueva y no la
  registras, falla; (2) **tablas** — si tocas una tabla que no está
  clasificada como por-usuario o global, falla, así que una migración nueva
  obliga a decidir de qué tipo es; (3) **anti-vacío** — cada action debe
  llegar de verdad a Supabase, porque una entrada que Zod rechace antes de
  consultar se vería como "aislamiento correcto" sin haber probado nada.
  Verificado quitando a mano el filtro de `getGoals` y de `deleteGoal`: ambos
  tests fallan nombrando la función y la tabla. Las
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
  puedan tener "Mascota". CRUD en `/categories` vía `createCategory` /
  `updateCategory` / `deleteCategory`: crear y editar rechazan nombres que
  choquen con una categoría visible (case-insensitive; al editar se excluye
  a sí misma, para que cambiar solo el color no falle); **borrar se bloquea
  si está en uso** — transacciones (guardan el nombre) o un presupuesto (FK
  con cascade que se perdería) — el usuario reasigna primero. Las globales
  nunca se editan ni se borran (el filtro por `user_id` lo impide).
- **Eliminar categorías por defecto** (`hidden_categories`, migración
  `0011`): en la UI se llama **Eliminar** y la categoría desaparece de la
  lista — es lo que el usuario espera y evita dejar filas grises ocupando
  espacio. Por dentro NO se borra: las 9 globales son compartidas entre
  usuarios y borrarlas de verdad afectaría a los demás, así que solo se
  ocultan para ese usuario (`setCategoryHidden`). De ahí la separación en
  `data.ts`: **`getAllCategories()`** (globales + propias, incluidas las
  ocultas) alimenta los REPORTES —`getCategorySpend` y
  `getBudgetsForMonth`— para que el historial no pierda su ícono, color ni
  su presupuesto; **`getCategories()`** resta las ocultas y alimenta todo
  lo que se ELIGE (alta manual, detalle, presupuestos nuevos, gastos
  fijos). El sync hace su propio filtro equivalente para que Gemini no
  sugiera una categoría eliminada. Como las eliminadas ya no se listan, la
  vía de vuelta es **`restoreDefaultCategories()`** ("Restablecer N
  eliminadas", visible solo si hay algo que restablecer). `setCategoryHidden`
  **no deja quitar la última categoría visible**: el alta de transacciones
  exige elegir una y quedarse en cero sería un callejón sin salida (mismo
  criterio que "Mis bancos").
- **Tarjetas** (`cards`, migración `0012`): control de gasto por tarjeta.
  Lo barato de esta función es que **`transactions.card_last4` ya existía
  desde el inicio** y los 5 parsers lo llenan, así que todo el historial ya
  venía etiquetado: la tabla `cards` solo le pone NOMBRE a unos últimos 4
  dígitos. El vínculo es por `(user_id, last4)`, **no** una FK en
  transactions — por eso registrar una tarjeta agrupa al instante los
  movimientos viejos, sin backfill, y borrarla solo quita la etiqueta.
  `getUnregisteredCards()` alimenta el **auto-descubrimiento**: lista los
  last4 que aparecen en las transacciones y aún no tienen tarjeta, con su
  conteo, para que el usuario solo les ponga nombre en vez de teclearlos.
  La función es **opcional de verdad**: sin tarjetas registradas no
  aparecen ni el filtro en /transactions ni el selector en el alta manual.
  El alta manual escribe `card_last4` (mismo campo que los correos) y las
  transacciones sin tarjeta (efectivo, transferencias, voz) quedan fuera de
  todo agrupado, que es lo correcto. `type` (débito/crédito) es
  **informativo**: a propósito NO cambia el saldo ni los presupuestos —
  modelar el crédito de verdad exigiría ciclos de corte y pagos de factura.
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
  **Qué cuenta como "posterior" lo decide `countsTowardBalance()`, no un
  `date > as_of` a secas** (bug real, corregido el 2026-09-01): muchos correos
  del banco NO traen hora — solo fecha — y los parsers los estampan al
  MEDIODÍA (los 6 tipos del Popular, las transferencias recibidas y los
  retiros CASH de Qik, BHD/Caribe sin hora). Con la comparación directa,
  ajustar el saldo por la tarde y recibir después una transferencia dejaba esa
  fila con fecha 12:00 — "anterior" al ajuste — y el saldo no se movía; el
  fallo se comía en silencio TODA transacción sin hora durante medio día. La
  regla usa el DÍA para lo que la fecha sabe con certeza y `created_at` solo
  para desempatar dentro del mismo día: día posterior → cuenta; día anterior →
  no (esto es lo que evita que un backfill de correos viejos infle el saldo);
  mismo día → cuenta si Peso la registró después del ajuste. El corte del día
  es medianoche AST (`startOfAstDay()`), no del servidor — en Vercel el proceso
  corre en UTC y partiría el día a las 8 p. m. de RD. Todo se compara en
  MILISEGUNDOS: Supabase devuelve los `timestamptz` como `…+00:00` y
  `toISOString()` produce `…Z`, así que comparar las cadenas da resultados
  equivocados. Tests en `balance.test.ts`.
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
- **/transactions consulta solo lo que la vista muestra** (`?m=YYYY-MM` +
  `?filter=`): la página llamaba a `getTransactions()` SIN límite y el cliente
  escondía todo lo que no fuera del mes visible — para pintar treinta días se
  serializaba el historial ENTERO en el payload RSC, en cada visita a la
  pestaña. Ahora el mes vive en la URL y decide la consulta; "Por confirmar"
  es la excepción y usa `getPendingTransactions()` (acotada por estado, no por
  fecha, con tope `PENDING_LIMIT` = 300) porque esa vista es global a
  propósito: una pendiente vieja no debe esconderse por cambiar de mes. El
  badge de la pestaña sale de `getPendingCount()` (un `count` sin filas), no
  de las transacciones cargadas. Mes y pestaña van en la URL y NO en estado de
  React porque son lo único que cambia qué filas pide el servidor — categoría
  y tarjeta siguen siendo estado local, solo acotan lo ya cargado. La
  navegación usa `useTransition` + `router.replace`: la lista anterior se
  queda atenuada hasta que llegan los datos, en vez de parpadear a un
  esqueleto en cada toque de ‹ ›. `parseMonthParam()` construye la fecha en
  hora LOCAL (`new Date(año, mes, 1)`): con `new Date("2026-03")` (UTC) el mes
  se desplazaría en RD (UTC-4).
  **El mes cruza al cliente como TEXTO `"YYYY-MM"` (`monthParam`), nunca como
  `Date`** — bug real, corregido el 2026-09-10. Un `Date` cruza la frontera
  RSC como INSTANTE, y el navegador lo reinterpreta en SU zona horaria: el
  servidor (Vercel, UTC) mandaba "1 de septiembre" como
  `2026-09-01T00:00:00Z`, que en RD (UTC-4) es el **31 de agosto a las
  8 p. m.**. Síntomas, los tres a la vez: la cabecera decía "Agosto" mientras
  la lista mostraba septiembre (la consulta del servidor SÍ era correcta, solo
  la etiqueta se corría), ‹ saltaba DOS meses (agosto → junio → abril) porque
  `subMonths` partía del día 31 y date-fns lo recortaba, y › calculaba como
  destino el mes en el que YA estabas, así que `router.replace` iba a la misma
  URL y la pantalla no cambiaba nunca. Las flechas usan `shiftMonthParam()`
  (aritmética de calendario sobre el texto) y la etiqueta sale de
  `formatMonthLabel(parseMonthParam(monthParam))`, que construye el `Date` con
  año y mes LOCALES. `/charts` nunca tuvo el bug porque calcula etiqueta y
  enlaces ‹ › **en el servidor**, y `/budget` porque ya pasaba un string —
  /transactions era la única pantalla que mandaba un `Date` al cliente. La
  suite corre en `TZ=America/Santo_Domingo` (`vitest.config.ts`) justo por
  esto: en UTC el bug es INVISIBLE y los 198 tests pasaban en verde. Por la misma razón `getAttentionItems()` (la
  campanita) dejó de cargar todo el historial para filtrar las no confirmadas
  y usa `getPendingSummary()`, que ordena por `created_at` y no por `date` —
  una transacción con fecha vieja puede haber entrado hoy, y ese timestamp es
  el que decide si un aviso descartado reaparece.
- **Filtros de categoría y tarjeta en hoja inferior**: en /transactions,
  categoría y tarjeta vivían como dos filas de chips SIEMPRE visibles,
  antes incluso de ver una sola transacción — con categorías personalizables
  esa fila podía crecer sin límite, y sumada a la fila de tarjetas eran
  hasta 5 filas de chrome sobre la lista. Ahora viven en un botón
  **"Filtros"** (mismo patrón de hoja inferior que `ConfirmDialog`/
  `AdjustBalanceDialog`) con un badge del conteo de filtros activos;
  dentro, las categorías van en grid/wrap (no scroll ciego) y se aplican al
  toque, sin paso de "Aplicar" — el botón de cerrar muestra en vivo cuántos
  resultados hay ("Ver N resultados"). Los chips de **tipo** (Todos/Gastos/
  Ingresos/Por confirmar) se quedaron fuera del botón a propósito: no son
  un filtro que acota, son la vista misma, llevan el badge de pendientes, y
  la campanita/dashboard enlazan directo a `?filter=pendientes` — esconder
  eso habría roto la señal de "qué estás viendo" al llegar por ese enlace.
- **Confirmación en lote** (`confirmTransactionsBulk`): en /transactions,
  filtro "Por confirmar" → "Seleccionar varias" activa checkboxes en
  `TxRow` (prop `selectable`). Si 2+ pendientes comparten la misma
  `ai_suggested_category`, aparece un atajo "N sugeridas como X" que las
  selecciona todas y precarga esa categoría de un tap — pensado para el
  caso de varias transacciones similares seguidas (p. ej. varios
  "PedidosYa" sugeridos como "Alimentación").
- **Auto-confirmación por comercio conocido** (migración `0015`,
  `merchant-history.ts` + `auto-confirm.ts`): TODA transacción importada por
  correo llegaba como "por confirmar", aunque fuera la quinta vez que llega el
  mismo Netflix. Un usuario real acumuló 244 pendientes — a ese volumen la
  pantalla deja de ser una bandeja y pasa a ser una deuda que nadie salda.
  Ahora, si el usuario ya categorizó ese comercio, la próxima se confirma sola.
  Tres reglas, todas en `merchant-history.ts` (puro, con tests):
  - **Mínimo 2 veces** (`MIN_OCCURRENCES`): una sola vez es casualidad, no
    costumbre. Si el historial mezcla categorías gana la más frecuente, y el
    conteo es el de la categoría GANADORA, no el total del comercio (una vez
    "Compras" y una vez "Educación" no hacen una regla).
  - **Coincidencia exacta** del nombre normalizado (`normalizeMerchant`:
    mayúsculas y espacios de sobra). Nada de prefijos: "PedidosYa\*Pizza Hut" y
    "PedidosYa\*Wendys" son comercios distintos y pueden ir a categorías
    distintas.
  - **Tope de monto** (`MAX_AMOUNT_FACTOR` = 2× el máximo histórico DE ESE
    comercio): la red de seguridad. Confirmar es también la oportunidad de ver
    un cargo que no reconoces, así que un Netflix de RD$6,490 se detiene y
    pregunta. El tope sale del propio historial, así que un supermercado que va
    de RD$200 a RD$5,000 tolera más sin configurar nada.
    Detalles que importan: la categoría solo vale si **sigue visible** para el
    usuario (pudo borrarla u ocultarla — si no, se resucitaría por la puerta de
    atrás); una auto-confirmada **no gasta llamada a Gemini** (el historial del
    propio usuario es mejor señal que la IA, y encima es gratis); y el sync
    comprueba el umbral de presupuesto de lo que confirmó solo
    (`notifyBudgetForAutoConfirmed`) porque ese aviso se dispara al CONFIRMAR —
    sin esto, automatizar se habría comido en silencio la alerta justo en las
    transacciones más frecuentes, que son las que más rápido agotan un
    presupuesto. La regla del umbral vive en `budget-alert.ts` para que los dos
    caminos (con sesión y sin ella) no puedan divergir.
    **`transactions.auto_confirmed` marca lo que decidió Peso** y no se deduce de
    `confirmed`: la lista lo enseña con un chip "AUTO", el detalle con un banner,
    y en cuanto la persona toca la transacción el sello se borra (la decisión ya
    es suya). El texto de la push también cambió — mandar a alguien a "confirmar"
    una bandeja que se confirmó sola es peor que no avisar.
    **`autoConfirmPending()` es la mitad que hace útil la otra**: las reglas solo
    actúan sobre lo que llega de aquí en adelante, así que sin un botón que las
    aplique a la cola ya acumulada la función no le resolvía nada a quien la
    pidió. Vive en /transactions → "Por confirmar" ("N son de comercios que ya
    categorizaste"), y **qué confirmar lo decide el servidor**: una server action
    es un endpoint público, y aceptar del navegador "confirma estas con esta
    categoría" sería aceptar una orden, no un dato. El número del botón sale de
    la MISMA función que ejecuta la acción (`findAutoConfirmable`) — si dijera 44
    y confirmara 12, la función perdería la confianza que necesita para que
    alguien la deje encendida.
    Apagable desde /profile (`users.auto_confirm_enabled`, default true): es
    automatización silenciosa sobre datos financieros. Apagarla decide el futuro,
    no revierte lo ya confirmado.
    Nota sobre los tests de aislamiento: `findAutoConfirmable` se para en seco si
    el historial viene vacío, así que registrarla a secas habría dado un test que
    jamás llega a la consulta de pendientes. Por eso `createFakeSupabase()` ganó
    un `seed(tabla, filas)`. Verificado quitando a mano el `.eq("user_id", …)` de
    esa consulta: ambos tests fallan nombrando función y tabla.
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
- **Páginas legales y eliminación de cuenta** (`app/(legal)/`): `/privacy` y
  `/terms` son **públicas** (añadidas a `PUBLIC_PATHS` del middleware) — no
  es una preferencia, Google **exige** una política de privacidad accesible
  sin login para verificar el scope `gmail.readonly`, además de la
  declaración de Uso Limitado (_Limited Use_) que está en el texto. El correo
  de contacto sale de `NEXT_PUBLIC_CONTACT_EMAIL` (placeholder visible si no
  se configura) para que quien despliegue su propia instancia ponga el suyo.
  La fecha de "última actualización" vive en `lib/legal.ts` y se escribe a
  mano: debe decir cuándo cambió el TEXTO, no cuándo se abrió la página —
  **si cambias qué datos se guardan o con quién se comparten, actualiza el
  texto Y la fecha.** `deleteAccountAction` es lo ÚNICO irreversible de la
  app (borrar transacciones es soft delete, las metas se recrean), así que
  exige teclear `ELIMINAR` y lo revalida en el servidor con Zod — una server
  action es un endpoint público, no basta con el diálogo. El borrado real es
  un solo `delete` sobre `users`: **todas** las tablas por usuario declaran
  `on delete cascade` (migraciones 0003, 0005–0008, 0010–0012) y esa cascada
  es parte del contrato — una tabla nueva sin ella dejaría datos huérfanos.
  Antes del delete se revoca el refresh token en Google (`revokeRefreshToken`,
  fallo suave): borrar la fila quita NUESTRO acceso, pero el consentimiento
  seguiría vivo en la cuenta del usuario.
- **Exportar a CSV** (`GET /api/export` + `lib/csv.ts`): los datos de un
  usuario solo viven en la base de datos de quien despliega la instancia, así
  que sin esto un borrado accidental se lleva años de historial; además es lo
  que la política de privacidad promete sobre acceder a tus datos.
  `getAllTransactionsForExport()` es la ÚNICA lectura sin acotar por mes ni
  límite, a propósito: el punto es llevarse todo, y no alimenta ninguna
  pantalla (va a un archivo y se descarta), así que no aplica lo del payload
  RSC de /transactions. Tres detalles que parecen menores y no lo son: el CSV
  empieza con **BOM** (sin él Excel en Windows abre el archivo como ANSI y
  destroza los acentos: "Alimentación" → "AlimentaciÃ³n"), el escapado sigue
  RFC 4180 (los nombres de comercio traen comas — "NACIONAL, S.A." — y sin
  entrecomillar desplazan todas las columnas de esa fila), y las fechas van
  como `YYYY-MM-DD HH:MM` en **AST**, no en ISO/UTC (Excel no reconoce el ISO
  con `Z` como fecha, y la hora UTC no es la que el usuario vivió). En la UI
  es un `<a download>` normal y no un fetch: el navegador gestiona la descarga
  solo y funciona igual en iOS. Funciona en modo demo (exporta los mock)
  porque es una LECTURA — los errores de modo demo son para las mutaciones.
- **Monitoreo** (`lib/monitoring.ts`, `MONITORING_WEBHOOK_URL`): cuando un
  banco cambia el formato de sus correos, el parser deja de reconocerlos y las
  transacciones **dejan de aparecer en silencio** — no hay excepción,
  `SyncResult.errors` se llena y se devuelve en un JSON que nadie lee (es
  exactamente el bug de los ~300 correos de `qik.do` que pasó un año sin que
  nadie lo notara). `reportIssue()` manda esos errores a un webhook entrante
  de Discord o Slack. Es un `fetch` y no un SDK de errores por coherencia con
  el resto: sin dependencias nuevas ni peso en el cold start. Manda `content`
  Y `text` en el mismo body para que el mismo webhook sirva en Discord y en
  Slack. Cada error de parseo lleva **el banco**, **el buzón** al que llegó el
  correo y el **esqueleto del correo** (`email-structure.ts`): el aviso
  original solo decía el asunto, y como el webhook dispara para el buzón que
  CAMBIÓ y no para el de quien opera la instancia, el correo casi siempre es
  de otra persona — sin saber de quién era ni cómo se veía, el monitoreo era
  un callejón sin salida. El esqueleto muestra las etiquetas conocidas
  literales y sustituye TODO lo demás por marcadores (`‹monto›`, `‹texto 27›`)
  porque el cuerpo es una notificación bancaria ajena y la política de
  privacidad promete que no se comparte — para arreglar un parser hacen falta
  las etiquetas y su orden, no los valores. La lista de etiquetas es BLANCA a
  propósito: la heurística tentadora ("muestra lo que no lleve dígitos")
  filtraría los nombres de comercio, que no llevan. El esqueleto se adjunta
  una sola vez por asunto y corrida (tres correos del mismo tipo comparten
  estructura) y el tope del mensaje son 1900 caracteres, por debajo de los
  2000 que admite Discord. Solo se avisa de los syncs AUTOMÁTICOS: el manual ya
  le enseña un toast al usuario, que está mirando. Throttle de 1 aviso/hora
  por contexto reusando `check_rate_limit()` — un banco roto falla en CADA
  sync y serían decenas de notificaciones diciendo lo mismo. Todo opcional y
  con fallo suave: sin la env var no se manda nada, y un aviso que falla nunca
  tumba el sync que lo estaba reportando.
- **Red para cuando un parser se rompe** (migración `0017`,
  `failed-emails.ts` + `parseEmailWithAi` en `gemini.ts`): el monitoreo avisa
  de QUE un banco cambió el formato, pero avisar no arregla nada — el usuario
  igual pierde la transacción, y quien opera la instancia no tiene el correo
  para escribir el arreglo (el webhook dispara para el buzón que CAMBIÓ, así
  que el correo casi siempre es de otra persona). Dos mitades:
  - **Se guarda el correo que falló**, cifrado con la misma clave que los
    refresh tokens (AES-256-GCM) y con `expires_at`; el cron diario que renueva
    los watches lo purga (`purgeExpiredFailedEmails`), porque una caducidad que
    nadie barre es una promesa vacía. Retención: `FAILED_EMAIL_RETENTION_DAYS`
    = 30. `upsert` sobre `(user_id, gmail_message_id)` — un correo roto vuelve a
    fallar en CADA sync y acumularía una fila por corrida.
    **Solo fallos**: la llamada vive DENTRO del `if` que ya distingue "no se
    pudo parsear" de "es ruido esperado" (`isIgnorableBankEmail`). Un correo
    que sí se leyó nunca pasa por esa línea, y de eso depende la política de
    privacidad. Se lee con `GET /api/admin/failed-emails` (Bearer
    `ADMIN_SECRET`, limitado por IP), que devuelve el cuerpo descifrado y **no**
    el user_id: para arreglar un parser hace falta el formato, no saber de quién
    es el correo.
    **`bank` guarda el ID (`popular`), no el nombre (`Banco Popular`)** — bug
    real: se guardaba el nombre mientras el endpoint filtraba por `?bank=popular`,
    así que la tabla se llenaba de muestras y el curl devolvía `{"count":0}`. Un
    fallo MUDO —sin error en el log ni en la respuesta— justo en la herramienta
    que existe para diagnosticar fallos mudos. El filtro además usa `ilike` para
    aceptar id o nombre, y así las filas guardadas antes del arreglo siguen
    apareciendo sin migración. `bank-identity.test.ts` vigila las dos mitades:
    que `bankIdForSender` devuelva un id del catálogo y no un nombre, y que el
    nombre de cada banco contenga su id (que es lo único que hace funcionar la
    tolerancia del `ilike`; un banco nuevo id `brd` / nombre "Banco de Reservas"
    la rompería en silencio). Verificado devolviendo el nombre a mano: fallan
    dos tests.
  - **Gemini lee el correo mientras tanto** (`parseEmailWithAi`). Lo que saca
    entra SIEMPRE sin confirmar y **nunca** se auto-confirma —`readByAi` corta
    esa vía de raíz— y se marca con `source='ai'`, que el detalle muestra en un
    banner ámbar. No es purismo: el monto y la fecha los dedujo un modelo de un
    formato que nadie ha verificado, y confirmar es el momento en que una
    persona los mira. Los parsers de regex siguen siendo la vía principal
    porque son deterministas y tienen tests con correos reales.
    **Dos frenos, los dos aprendidos de para QUÉ existe esto** — cuando un banco
    cambia el formato fallan MUCHOS correos a la vez: (1) la IA se intenta solo
    la PRIMERA vez que se ve cada correo (`saveFailedEmail` devuelve si la fila
    era nueva), porque un correo que ni el regex ni la IA saben leer nunca llega
    a insertarse y por tanto reaparece en CADA sync para siempre — sin este
    freno sería una llamada a Gemini por correo y por corrida, eternamente; y
    (2) `AI_PARSE_LIMIT` = 8 por corrida, porque el sync vive en una función con
    60s de tope y cincuenta llamadas en serie lo revientan, tumbando el sync
    ENTERO justo el día que esto tenía que salvarlo. Lo que pasa del tope se
    queda como muestra guardada, que es lo que de verdad arregla el parser.
    `ai-email-parser.test.ts` no comprueba que Gemini acierte (no se puede) sino
    lo contrario: que nada de lo que devuelva se convierta en una fila a medias
    — sin monto, con monto 0 o negativo, sin comercio, sin tipo, con una fecha
    inventada, o cuando el correo ni siquiera es una transacción. Verificado
    anulando la validación de campos mínimos: el test falla nombrando el caso.
    **Esto cambió la política de privacidad**, no solo el código: la frase "el
    cuerpo del mensaje se descarta" dejó de ser cierta sin excepción, y el cuerpo
    ahora viaja a Gemini. `/privacy` lo dice explícitamente (qué se guarda, cuánto
    dura, para qué se usa) y `LEGAL_UPDATED` se movió. Nota para quien despliegue
    esto: Google restringe la **revisión humana** de datos del scope
    `gmail.readonly`, y leer el correo crudo de otro usuario cae ahí.
  - **`raw_email_snippet` dejó de escribirse** (migración `0018`). Guardaba el
    `snippet` de Gmail —unos 200 caracteres del cuerpo— en CADA transacción
    desde la migración 0001, nunca se mostró en ninguna pantalla ni se exporta
    al CSV, y contradecía la frase "el cuerpo del mensaje se descarta" desde el
    primer día. Salió a la luz al revisar la política para lo de arriba. El
    arreglo no fue documentarlo sino dejar de guardarlo y vaciar lo que había:
    para depurar un parser ya existe `failed_emails`, que guarda el correo
    entero, cifrado, con caducidad y solo cuando de verdad falló.
- **Rate limiting** (`rate_limits` + `check_rate_limit()`, migración `0014`):
  el contador vive en Postgres, NO en memoria — la app corre en funciones
  serverless y cada petición puede caer en una instancia distinta, así que un
  `Map` en memoria no cuenta nada útil (un atacante en paralelo pega en
  instancias frías y lo esquiva). Es una función de Postgres y no un
  select+update desde el código porque leer y escribir por separado deja una
  carrera por la que N peticiones simultáneas leen el mismo contador y todas
  pasan — justo el escenario de un ataque; el upsert de `check_rate_limit()`
  es una sola sentencia atómica (verificado: 40 llamadas concurrentes → 40
  incrementos). Ventana fija, con limpieza oportunista (~1 de cada 100
  llamadas borra filas de más de un día) para que la tabla no crezca sin fin.
  **Falla ABIERTO** a propósito: si Supabase no responde deja pasar y lo
  loguea — fallar cerrado convertiría un hipo de la DB en "nadie puede entrar".
  Aplicado en `/api/auth/email/register` (5/hora por IP — cada alta gasta un
  scrypt de ~96 MB, sin freno un script tumba las functions y sube la
  factura), `/api/auth/email/login` (20/15min por IP — complementa
  `failed_login_attempts`, que es por CUENTA y no ve nada si prueban una
  contraseña común contra mil correos), `setPassword` (10/hora por usuario) y
  `/api/admin/mint-token` (10/hora por IP). `clientIp()` prefiere `x-real-ip`
  y, en `x-forwarded-for`, toma la ÚLTIMA entrada: la primera puede haberla
  escrito el cliente, la última la pone el proxy de confianza.
- **Error boundaries** (`(app)/error.tsx`, `global-error.tsx`,
  `not-found.tsx`): antes no había NINGUNO. Como `data.ts` lanza cuando
  Supabase falla, cualquier hipo de red le mostraba al usuario la pantalla
  gris de Next.js ("Application error: a server-side exception has occurred"),
  en inglés y sin salida — toda la app cuidaba los errores de MUTACIÓN
  (`friendlyDbError` + toasts) y dejaba las LECTURAS al descubierto.
  `(app)/error.tsx` conserva el BottomNav (se puede navegar a otra pantalla),
  ofrece `reset()` y muestra el `digest` para poder cruzarlo con los logs de
  Vercel — el stack real nunca se manda al navegador. Ojo al probarlo: el
  boundary es un client component, así que el HTML del SSR **no** lo trae; se
  pinta tras hidratar (mirar el HTML crudo con curl engaña).
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

Bancos soportados (2026-09-11): **Qik** (5 tipos), **Banco Popular**
(7 tipos — remitente `notificaciones@popularenlinea.com`, tablas
COLUMNARES: etiquetas primero y valores después, fechas en D/M/YYYY,
D/M/YY y YYYYMMDD según el tipo, montos `RD$`/`RD $`/`RD` a secas),
**Banco Caribe** (1 tipo confirmado — `notificaciones@bancocaribe.com.do`,
campos inline, monto SIN prefijo con la moneda en campo aparte — puede ser
USD — y fecha/hora con espacios: `24 / 06 / 2026`, `12 : 25 : 56`),
**Scotiabank** (6 tipos — `alertas@scotiabank.com`, prosa sin tabla;
**el cuerpo trae hora pero NO fecha** — la fecha sale del `receivedAt` del
correo, por eso los parsers reciben ese parámetro), **BHD** (2 tipos —
`alertas@bhd.com.do`; "Pagos al Instante en Proceso" de
`notificaciones@bhd.com.do` se ignora a propósito: es un estado intermedio
que duplicaría la transferencia final) y **Banreservas** (3 tipos —
`notificaciones@banreservas.com` y `notificacionestubancoapp@banreservas.com`,
campos "Label:" con el valor en la línea siguiente; **bug real del banco**:
la fecha a veces llega en 24h con un sufijo "PM" pegado encima
(`31/07/2026 17:32 PM`) — el parser detecta hora > 12 y la toma tal cual,
ignorando el sufijo). El detalle de cada formato vive como doc comment en
su parser.

**Lo que se aprendió arreglando el Popular el 2026-09-11** (primer uso real
de `/api/admin/failed-emails`, ver § Red para cuando un parser se rompe):

- **La tabla columnar llega de DOS formas** y el parser solo conocía una.
  La versión HTML pone cada celda en su línea; la de **texto plano** mete todas
  las etiquetas en UNA línea separadas por **tabuladores**, y los valores
  igual. `zipColumns()` intenta primero la forma clásica y cae a
  `zipTabSeparated()`. No se pueden confundir: la línea de etiquetas con tabs
  no termina en la primera etiqueta, y el formato de una-por-línea no tiene
  tabs que partir.
- **En la forma con tabuladores un valor puede partirse en varias líneas.**
  `"STARBUCKS\nCUMAYASA"`, `"BANCO POPULAR\nOF. C. NACI"`. Por eso no se lee
  una línea sino que se van UNIENDO hasta juntar tantos campos como etiquetas
  — leer solo la primera daba "STARBUCKS" y perdía media mitad del comercio,
  que además rompería la auto-confirmación por comercio.
- **"Notificación transferencia recibida por canal digital" era un tipo que no
  existía** en el parser, así que TODAS las transferencias recibidas se
  perdían — y era el fallo más frecuente de la tabla de muestras. Es un
  **ingreso**; comparte la estructura Monto/Fecha/Canal del depósito por ATM
  pero se construye aparte, porque el texto que ve el usuario es distinto y el
  banco puede cambiarlos por separado.
- **"su cuenta terminada en 0386" NO va a `card_last4`.** Es una cuenta, no una
  tarjeta: guardarla ahí crearía una tarjeta fantasma en /cards y agruparía
  bajo ella transferencias hechas sin ninguna tarjeta.
- Los fixtures de estos tres casos son correos reales **de otro usuario**, así
  que el nombre y los últimos 4 dígitos van ENMASCARADOS a mano en el test —
  los de Qik venían ya enmascarados por el propio banco, estos no.

**Segunda tanda, la misma tarde**: con el arreglo desplegado la tabla de
muestras volvió a llenarse, así que el primer pase solo había tapado una parte.
Seis causas distintas, todas confirmadas contra el correo real antes de tocar
nada (el ciclo completo: `curl` → reproducir en un test → arreglar):

- **El salto de línea se come el TABULADOR.** El correo viene duro-envuelto a
  ~72 caracteres y ese envoltorio no respeta la tabla: además de partir un valor
  en dos líneas (que ya se contemplaba), a veces cae JUSTO en el separador y
  llega `"KFC SAN PEDRO\nAprobada"` donde debía haber un tab. Como las líneas se
  unían con un espacio, las columnas nunca llegaban a cinco y el correo se
  descartaba entero. Ahora se une conservando el `\n` y
  `repairWrappedSeparators()` parte por el último salto de las celdas de la
  derecha hasta cuadrar el número de columnas. **La ambigüedad no se puede
  resolver mirando el texto** —el mismo carácter significa las dos cosas— así
  que la red es el validador de cada builder: Estatus debe ser exactamente
  "Aprobada" y el monto y la fecha deben parsear, de modo que un corte
  equivocado falla ruidosamente en vez de insertar media transacción.
- **`parsePopularAmount` exigía `RD`**, y un consumo en dólares llega como
  `US$11.99`: el monto volvía null y se perdía la transacción ENTERA aunque el
  resto de la tabla estuviera perfecta. Sigue exigiendo una marca de moneda
  (`RD`, `US` o `$`) porque también se usa sobre prosa, donde cualquier número
  suelto sería un número de cuenta.
- **Las transacciones DECLINADAS** usan el asunto de una aprobada pero otra
  plantilla (sin columna Moneda), así que no se parsean — y se reportaban como
  "el banco cambió el formato", guardando una muestra por cada intento fallido
  de pagar. `isIgnorablePopularEmail` ahora recibe el CUERPO y las reconoce como
  ruido: el dinero nunca se movió. Un test comprueba lo contrario (que un
  consumo aprobado NO es ignorable), que es lo que evita que esta regla se coma
  transacciones reales.
- **Dos asuntos que el dispatcher no conocía**: "Notificación transf recibida
  via app e IB" (el banco abrevia según el canal — es el mismo ingreso) y
  "Notificación de depósito recibido en sucursal" (misma tabla que el depósito
  por ATM). Ambos se despachan con regex en vez de `includes` de la frase larga.
- **Qik: "Tu tarjeta ha sido bloqueada"** (por CVV/PIN incorrecto) es una alerta
  de seguridad, no un movimiento — el consumo que la provocó ni se cobró.

**Y debajo de todo eso había un bug que no era del Popular** (2026-09-11, el
que de verdad explicaba la mayoría): la prueba de "¿esto es HTML?" era
`/<[a-z][\s\S]*>/`, y un correo de TEXTO PLANO escribe sus enlaces entre
ángulos — `<https://www.popularenlinea.com/…>`, que empieza por `h` minúscula y
cumplía esa expresión. El correo se trataba como HTML y pasaba por
`htmlToText`, que colapsa `[ \t]+` en un espacio y por tanto **se come los
TABULADORES**: la tabla columnar desaparecía y el correo entero se perdía.

- **El síntoma engañaba a propósito**: el esqueleto del monitoreo se calcula
  sobre ESE MISMO texto ya destrozado, así que decía "Etiquetas encontradas:
  ninguna" y mandaba a buscar un cambio de formato del banco que nunca existió.
  La muestra guardada en `failed_emails` sí traía el cuerpo CRUDO — por eso se
  pudo ver que la tabla estaba intacta y el problema era nuestro.
- **No era un caso raro ni exclusivo del Popular**: `<enlace>` es la forma
  normal de escribir un enlace en la parte de texto plano de un correo, y la
  heurística estaba COPIADA en diez sitios (los seis parsers, dos veces en
  `sync.ts`). Ahora hay una sola `toPlainText()` en `qik-parser.ts` y
  `looksLikeHtml()` exige una etiqueta de verdad: nombre conocido y después un
  `>` o un espacio (atributos). `qik-parser.test.ts` lo cubre por los dos
  lados — que un `<https://…>` o un `<mailto:…>` NO cuente como HTML y que los
  tabuladores sobrevivan, y que el HTML de verdad sí se convierta.
- La lección general: cuando el diagnóstico dice "el banco cambió el formato",
  **comprueba primero el cuerpo crudo contra el parser en un test**. Aquí el
  banco no había cambiado nada.

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
     Disponible", "Tarjeta Débito" (`49***...3326` → últimos 4 dígitos). Las
     compras con tarjeta de **crédito** usan "Comercio" en vez de
     "Localidad"/"Lugar" — visto en producción el 2026-09-01, **sin confirmar
     todavía contra el correo completo** (el monitoreo solo entrega su
     esqueleto, nunca el contenido — ver § Monitoreo). Si sigue fallando para
     tarjetas de crédito, hace falta el correo real.
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

- Código CASH creado/vencido, estados de cuenta, recordatorio de fecha de pago
  (Qik lo manda con al menos dos redacciones distintas: "¡Tu fecha de pago se
  acerca!" y "Recuerda realizar tu pago").
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
  historial que se perdió. **El sync se corta solo antes del tope de la
  función** (`SYNC_TIME_BUDGET_MS` = 50s, contra los 60s de `maxDuration`) y
  devuelve `timedOut: true` con cuántos correos y usuarios quedan: repetir la
  llamada continúa desde donde se quedó. Sin ese freno, un backfill grande se
  pasaba de los 60s y Vercel respondía `FUNCTION_INVOCATION_TIMEOUT` —sin JSON
  y sin decir qué alcanzó a hacer— fallando SIEMPRE en el mismo punto, así que
  no había forma de terminarlo. El costo no está en la ventana sino en procesar
  cada correo (una llamada a Gemini por correo nuevo), que es por qué bajar a
  `days=10` tampoco lo arreglaba. Parar a mitad es seguro porque el sync es
  idempotente: `gmail_message_id` es UNIQUE y el chequeo de monto+fecha+tipo ya
  estaba. `runSyncAll` reparte UN presupuesto entre todos los usuarios y no
  empieza con uno al que no le puede dedicar tiempo. El aviso de corte se
  manda al monitoreo pero NO se cuenta como error de parseo, para que el
  número que abre la alerta siga siendo el de correos que no se pudieron leer. `fetchQikEmails()` pagina y limita la
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

| Variable                                             | Qué es                                                                                                           | Dónde se obtiene                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                           | URL del proyecto                                                                                                 | Supabase → Settings → API           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                      | Key pública (no se usa en runtime; RLS bloquea todo)                                                             | Supabase → Settings → API           |
| `SUPABASE_SERVICE_ROLE_KEY`                          | Key de servidor — **secreta**                                                                                    | Supabase → Settings → API           |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`            | OAuth2 client — login con Google Y lectura de Gmail                                                              | Google Cloud Console (abajo)        |
| `TOKEN_ENCRYPTION_KEY`                               | Cifra los refresh tokens de Gmail en la DB (AES-256-GCM)                                                         | `openssl rand -base64 32`           |
| `GMAIL_PUBSUB_TOPIC`                                 | Tópico de Cloud Pub/Sub para Gmail Push                                                                          | Google Cloud Console (§ Gmail Push) |
| `GMAIL_WEBHOOK_AUDIENCE`                             | URL pública de /api/gmail-webhook, valida el JWT de Pub/Sub                                                      | Tu dominio de Vercel                |
| `GEMINI_API_KEY`                                     | API key de Gemini                                                                                                | https://aistudio.google.com/apikey  |
| `SYNC_SECRET`                                        | Protege /api/sync (llamadas externas manuales)                                                                   | `openssl rand -hex 32`              |
| `ADMIN_SECRET`                                       | Protege /api/admin/mint-token (genera el token de API de un usuario para el Shortcut de iOS)                     | `openssl rand -hex 32`              |
| `CRON_SECRET`                                        | Protege /api/gmail-watch/renew — **debe llamarse así**, Vercel lo inyecta automáticamente en sus crons           | `openssl rand -hex 32`              |
| `SESSION_SECRET`                                     | Firma la cookie JWT de sesión                                                                                    | `openssl rand -base64 32`           |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (opcional): sin ellas la sección "Notificaciones" del perfil no aparece y nada más cambia               | `npx web-push generate-vapid-keys`  |
| `VAPID_CONTACT_EMAIL`                                | Contacto que los servicios de push pueden usar si hay un problema con tus envíos (opcional; default placeholder) | Tu email                            |
| `NEXT_PUBLIC_CONTACT_EMAIL`                          | Correo de contacto que se muestra en /privacy y /terms (Google exige un contacto en la política)                 | Tu email                            |
| `MONITORING_WEBHOOK_URL`                             | Webhook (Discord/Slack) para avisos de fallos del sync automático (opcional; sin ella no se manda nada)          | Webhook entrante de tu servidor     |

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
- **Login con correo y contraseña como segunda puerta** (migración `0013`,
  `lib/password.ts`): Google dejó de ser la única opción por un problema
  REAL de iOS — una PWA instalada que navega a `accounts.google.com` sale
  del modo standalone, y la cookie de sesión termina en el almacén del
  navegador incrustado, NO en el de la PWA: el usuario vuelve a `/login` en
  bucle infinito. Un login por correo es **same-origin**, nunca abandona el
  dominio, y la sesión cae donde debe. Detalles del modelo:
  - **scrypt de `node:crypto`**, no bcrypt/argon2: sin dependencias nuevas
    (coherente con evitar paquetes pesados), memory-hard y avalado por
    OWASP. Formato `scrypt$N$r$p$salt$hash`, auto-descriptivo para poder
    subir los parámetros sin invalidar hashes viejos.
  - **El registro rechaza un correo ya existente** en vez de adoptarlo:
    sin verificar el correo, ponerle contraseña a una cuenta ajena sería un
    secuestro. La vía segura de añadirle contraseña a una cuenta de Google
    es `setPassword` desde el perfil, donde la sesión abierta prueba que la
    cuenta es tuya. Al revés SÍ se enlaza solo: Google verifica el correo,
    así que `upsertUserFromGoogle` puede reclamar una cuenta creada con
    contraseña.
  - **Recuperación sin enviar correos**: la app no manda ningún email, así
    que no hay "olvidé mi contraseña" por link. Como todos entran con
    Gmail, la vía de vuelta es entrar con Google y cambiarla desde el
    perfil (está escrito en la pantalla de login). Único caso sin salida:
    alguien registrado con un correo no-Google que olvide su contraseña.
  - **Freno de fuerza bruta**: `failed_login_attempts` + `locked_until` en
    `users`; a los 8 fallos seguidos bloquea 15 minutos y se limpia al
    entrar bien. El endpoint responde lo MISMO para "no existe" y
    "contraseña mala" — decir cuál falló confirmaría qué correos tienen
    cuenta.
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
- **Tema oscuro** (2026-09-08): tres opciones en /profile → Apariencia —
  **Sistema** (default), **Claro** y **Oscuro**. La preferencia vive en
  `localStorage["peso-theme"]` y NO en la cuenta: es por dispositivo (la
  misma persona puede querer claro en el iPhone y oscuro en el escritorio).
  `ThemeScript` la aplica en un `<script>` en línea y síncrono dentro del
  `<head>` — tiene que correr ANTES del primer paint, porque cualquier cosa
  que dependa de React (efecto, estado) llega con la pantalla ya pintada y
  se vería el flashazo blanco. Por eso el `<html>` lleva
  `suppressHydrationWarning`.
  - **Por qué hay una clase `.light` y no solo `.dark`**: el modo automático
    lo resuelve `@media (prefers-color-scheme: dark)`, así que forzar
    "Oscuro" solo necesita `.dark`. Pero forzar **"Claro" con el sistema en
    oscuro** requiere poder DESACTIVAR esa media query, y eso es lo que hace
    `:root:not(.light)`. Sin `.light`, elegir "Claro" no haría nada para
    quien tenga el iPhone en oscuro.
  - **La paleta oscura está escrita dos veces** en `globals.css` (la media
    query del modo automático y la clase `.dark` del forzado). CSS no permite
    compartir un bloque entre las dos condiciones. Si se desincronizan, la
    app se ve distinta según CÓMO llegaste al modo oscuro — un bug silencioso
    y horrible de diagnosticar; **`theme.test.ts` falla si divergen** (mismos
    tokens, mismos valores) y también si añades un token al tema claro sin
    contraparte oscura. Verificado a mano con las tres formas de romperlo.
  - **Tokens `-solid`** (`--accent-solid`, `--expense-solid`): un color de
    marca no puede servir a la vez de TEXTO sobre fondo oscuro y de RELLENO
    con texto blanco encima — no es cuestión de gusto, es aritmética: para
    llegar a 4.5:1 como texto hace falta luminancia ≥ 0.236 y para que el
    blanco encima llegue a 4.5:1 hace falta ≤ 0.183. Por eso los que se usan
    de las dos formas están partidos: `bg-accent-solid` (relleno, mismo azul
    en los dos temas) vs `text-accent`/`border-accent`/`bg-accent/10` (se
    aclara en oscuro). `income` y `warning` NO se parten: sobre fondo oscuro
    ya dan 5.07 y 5.24 sin tocarlos. Los cuatro acentos quedan entre 5.0 y
    5.3 de contraste sobre `--card`: al estar igualados ninguno grita, que es
    lo que separa un tema oscuro sobrio de uno de neón.
  - **`text-white` sobre `bg-ink` era un bug** (el toast de éxito, el chip
    activo de /transactions): en oscuro `--text-primary` es casi blanco, así
    que la píldora quedaba blanca con texto blanco. El par correcto de
    `bg-ink` es `text-ink-inverse`, que se invierte con el tema.
  - Los **avatares de comercio** guardan un ÍNDICE (`merchantTint`) y no un
    hex: los pasteles claros del tema claro se ven como manchas brillantes
    sobre fondo oscuro. El color real lo pone `.avatar-tint-N` en
    `globals.css` y cambia con el tema.
  - `color-scheme` en `:root` es lo que hace que los controles NATIVOS
    (inputs de fecha y número, el selector de hora, scrollbars) se pinten
    oscuros. Sin él quedan blancos y desentonan.
  - El **halo azul** de `shadow-accent` se cambia por sombra negra en oscuro:
    sobre fondo oscuro un resplandor de color se lee como neón. `shadow-fab`
    dejó de ser azul en LOS DOS temas al llegar la muesca — ver abajo.
  - `meta[name=theme-color]` (la franja del notch en la PWA) ya NO puede
    depender de `prefers-color-scheme`, porque la preferencia del usuario
    puede ir CONTRA la del sistema; es un único `<meta>` sin `media` que
    `ThemeScript` reescribe. `THEME_COLOR` en `theme.ts` debe coincidir con
    `--background` de cada tema — el test lo comprueba.
  - `global-error.tsx` no puede usar Tailwind (reemplaza el layout que acaba
    de fallar, así que globals.css no se cargó): trae su propia mini-paleta
    en línea y reusa `ThemeScript`, para no soltar un flashazo blanco justo
    en el peor momento.
  - Lo único que sigue siendo claro en los dos temas es el `manifest.ts`
    (`theme_color`/`background_color`): es estático, se usa para el splash de
    instalación y no puede leer la preferencia del usuario.
- **Sin emoji en la interfaz** (2026-09-10): los emoji se cambiaron por SVG de
  trazo (`components/icons.tsx` + `components/category-icons.tsx`). No es solo
  gusto: un emoji lo dibuja CADA sistema operativo a su manera (el mismo 🛍️ no
  se parece en iPhone y en Android), no se repinta con el tema — sobre fondo
  oscuro queda como una calcomanía brillante — y desentona con una interfaz que
  es toda de trazo lineal.
  - **Las metas de ahorro SÍ conservan su emoji** (`savings_goals.icon`,
    `GOAL_ICONS`): ahí el ícono es una decisión personal del usuario sobre SU
    meta ("🏝️ Viaje a Punta Cana"), no parte del vocabulario visual de la app.
  - **`categories.icon` guarda una CLAVE** (`"cart"`), no un emoji ni markup
    (migración `0016`). El catálogo vive en el código: `lib/category-icons.ts`
    tiene las claves y `categoryIconKey()`, `components/category-icons.tsx` los
    dibujos. Separados por la misma razón que `banks.ts` de `bank-parser.ts`:
    `schemas.ts` valida la clave con `z.enum(CATEGORY_ICON_KEYS)` sin arrastrar
    18 SVG de React a las server actions y las rutas de API.
  - **`LEGACY_EMOJI` traduce lo que la migración no alcance** (una categoría
    creada entre el deploy y la corrida, un backup restaurado, un emoji
    tecleado a mano en el campo libre que el selector tenía antes). El mapa del
    código y el `case` de la migración son dos sitios que pueden
    desincronizarse en silencio, así que **`category-icons.test.ts` lee el .sql
    y falla si divergen** — mismo criterio que `theme.test.ts` con la paleta
    oscura. Verificado cambiando a mano `'coffee'` por `'cafe'` en la
    migración: fallan dos tests nombrando la clave.
  - **El selector de categoría es una rejilla cerrada**, no el campo de emoji
    libre de antes: solo ofrece lo que la app sabe dibujar, así que no hay
    forma de elegir algo que luego se vea como un cuadrito.
  - **El glifo de categoría se pinta con un token del tema, NO con
    `category.color`.** Esos colores se eligieron mirando el tema claro, y los
    grises del seed (`#475569`, `#6B7280`) sobre fondo oscuro quedan casi
    invisibles — se vio en la captura, no en el código. La regla que quedó: el
    ícono identifica, el color informa, y el color sigue llevando dato donde
    importa (las barras del presupuesto y el donut).
  - **`AttentionItem` ya no lleva `icon`**: la campanita elige el SVG según
    `kind`. Guardar un emoji en `data.ts` era arrastrar decoración por la
    frontera RSC y dejar dos sitios capaces de desincronizarse.
  - Los signos TIPOGRÁFICOS se quedan (`✓` dentro de una frase, `−`, `‹ ›`,
    `≈`, `▲▼`): son texto, no dibujos, y heredan la fuente y el color.
- **Área táctil de 44px** en todo botón de solo ícono (el mínimo de las guías
  de Apple; varios estaban en 32-36px). Donde 44px de ANCHO le robaban espacio
  al texto —el ✕ de la bandeja de notificaciones truncaba el título— el botón
  crece con un margen negativo que lo mete dentro del padding de la fila: crece
  la zona que se puede tocar, no el hueco que ocupa.
- **Convenciones de UX** (2026-07-18): toda mutación confirma con un toast
  (`useToast()`, provider en el layout de `(app)`) — nunca terminar una
  acción en silencio. Los banners promocionales/opcionales del dashboard
  (vincular Gmail, Face ID) son descartables con memoria (`Dismissible`,
  localStorage); el de "reconectar Gmail" NO es descartable a propósito
  (es una rotura real del sync). Estados vacíos siempre con acción (CTA o
  celebración), nunca un callejón sin salida. Errores de Supabase pasan por
  `friendlyDbError()` (mensaje humano en español; el crudo va a
  console.error para los logs de Vercel).
- **Navegación: 4 destinos + FAB, y todo lo demás bajo "Más".** El nav es
  Inicio · Transacciones · [+] · Gráficas · **Más**. Las pantallas de
  gestión (Tarjetas, Presupuesto, Gastos fijos, Metas, Categorías, Perfil)
  vivían
  repartidas entre el nav, tarjetas del dashboard y el perfil — con cada
  función nueva el dashboard se llenaba de tarjetas. Ahora `/more` es el
  índice único, y cada fila muestra su **estado real** ("3 de 5 pagados
  este mes") para que informe y no sea solo un menú. Presupuesto salió del
  nav porque además se llega desde la push de "80% del presupuesto";
  Gráficas se queda porque no tiene otra puerta de entrada. `MORE_ROUTES`
  en `BottomNav` marca la pestaña activa estando en cualquier hija. El
  dashboard conserva sus dos tiles compactos (Gastos fijos y Metas) **a
  propósito**, duplicando dos filas de "Más": el menú es el índice
  completo, el tile es el vistazo de un segundo ("3/5 pagados") sin
  navegar. Lo que sí se quitó del dashboard fue la tarjeta de "N por
  confirmar", que ya vive en la campanita.
- **El FAB va en una muesca de la barra** (2026-09-10, `.nav-notch` en
  `globals.css`): el botón "+" es un círculo que sobresale por encima de la
  bottom nav, y el borde superior de la barra lo RODEA en vez de pasarle por
  detrás.
  - **Máscaras CSS, no un SVG de fondo.** La barra ocupa todo el ancho de la
    pantalla: un SVG estirado con `preserveAspectRatio="none"` convertiría el
    círculo en un óvalo en pantallas anchas, y uno "meet" dejaría de cubrir los
    extremos. Un `radial-gradient` se posiciona en % y conserva el círculo a
    cualquier ancho — comprobado a 390px y a 900px.
  - **Tres capas**: el elemento pinta `--background` (lo que se ve dentro de la
    mordida), `::before` pinta `--line` con un agujero de radio R, y `::after`
    pinta `--surface` con un agujero de radio R+1 y 1px de inset. Los agujeros
    son concéntricos y difieren 1px, así que entre los dos radios solo asoma la
    línea y esa franja mide 1px en TODO el recorrido de la curva. En el tramo
    plano el mismo efecto lo da el inset. Todo con tokens, así que la muesca
    sigue al tema oscuro sin duplicar nada.
  - **La mordida se rellena con `--background` y no se deja transparente.** Con
    el agujero pasante, el anillo entre el botón y la barra dejaba ver el
    contenido que scrollea por detrás: una media luna con trozos de texto
    pasando por dentro. Tapar no es mentir — la barra ya es opaca sobre ese
    mismo contenido.
  - **`--notch-r` y `--notch-y` viven en el `<nav>`, no en `.nav-notch`.** Las
    leen tanto la máscara como el botón: el FAB se posiciona con
    `top-[var(--notch-y)]`, así que mover la muesca mueve el botón con ella.
    Antes eran dos números que había que acordarse de cambiar a la vez, y
    desalinearlos rompía el anillo sin que nada lo impidiera.
  - **El safe area NO se suma a un padding propio.** La barra tenía `pb-safe`
    (~34px en iPhone) MÁS un `pb-2`: casi 42px de vacío bajo las etiquetas, que
    en el teléfono se ve como una franja muerta. Ahora el padding inferior es
    `max(0.5rem, calc(env(safe-area-inset-bottom) - 8px))` — se le restan 8px
    porque el indicador de inicio ocupa bastante menos que el inset completo, y
    el `max` mantiene un margen normal donde no hay safe area (escritorio).
    Esto solo lo ve un teléfono real: en Chromium el inset es 0 y el problema
    es invisible.
  - **`shadow-fab` pasó de halo azul a sombra neutra.** Con la barra plana el
    resplandor daba la profundidad; con la muesca la da el recorte, y el halo
    azul de 12px se comía justo el arco de `--line` que hay que ver — invisible
    en el código, evidente en la captura del tema claro.
  - Si el navegador no soporta máscaras, la capa de superficie tapa a las otras
    dos salvo ese 1px de arriba: queda la barra plana de siempre, sin muesca.
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
