# Peso — Finanzas personales (PWA)

App multi-usuario para rastrear gastos e ingresos, instalable en el iPhone como
PWA. Cada usuario entra con su cuenta de Google o con correo y contraseña, y
puede **vincular su Gmail** para que Peso importe automáticamente las
notificaciones de sus bancos, las **categorice con IA** (Gemini) y las muestre
en una interfaz móvil limpia.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase
(Postgres) · Gemini · Web Push · desplegada en Vercel.

---

## Pruébala en 30 segundos (modo demo)

Sin ninguna configuración, la app corre con datos de ejemplo y **sin login** —
toda la interfaz es navegable:

```bash
npm install
npm run dev      # http://localhost:3000
```

Las mutaciones devuelven un error amigable en modo demo. Para datos reales,
configura Supabase (abajo).

---

## Qué hace

- **Importación automática de correos bancarios.** Vincula tu Gmail y Peso lee
  (solo) las notificaciones de tus bancos y las convierte en transacciones. Vía
  Gmail Push (Cloud Pub/Sub) llegan en segundos.
- **Categorización con IA.** Gemini sugiere la categoría de cada transacción;
  si falla, la transacción se guarda igual (nunca rompe el sync).
- **Multi-usuario.** Cada quien ve solo sus datos; aislamiento por `user_id` en
  cada query.
- **Multi-moneda** (DOP / USD / EUR) con moneda de casa por usuario y tasa del
  día cacheada.
- **Presupuestos, metas de ahorro, gráficas** y comparativas mes a mes.
- **Categorías personalizadas** por usuario, además de las que trae por defecto.
- **Captura por voz** desde un Shortcut de iOS (dictado o rápido).
- **Bloqueo con Face ID** (passkey local opcional) y **notificaciones push**.

## Bancos soportados

Los parsers están hechos para bancos **dominicanos**: **Qik**, **Banco
Popular**, **Banco Caribe**, **Scotiabank**, **BHD** y **Banreservas**. Cada
usuario elige cuáles sincronizar desde su perfil.

> **¿Otro banco u otro país?** La importación por correo no funcionará hasta que
> escribas un parser para ese banco (necesitas 2+ correos reales — no adivines
> el formato). Igual puedes usar **alta manual** y **captura por voz** sin
> ningún parser. Ver `src/lib/bank-parser.ts` y los tests para el patrón.

---

## Auto-hospedaje (tu propia instancia)

Peso es **"trae tu propia infraestructura"**: no hay servicio central. Tu
instancia usa **tu** Supabase, **tu** proyecto de Google Cloud y **tu** API key
de Gemini — tus datos y tu correo nunca tocan la instancia de nadie más.

Necesitas cuentas (todas tienen plan gratis suficiente para uso personal):

| Servicio         | Para qué                                           |
| ---------------- | -------------------------------------------------- |
| **Supabase**     | Base de datos Postgres                             |
| **Google Cloud** | Login con Google + lectura de Gmail + Gmail Push   |
| **Gemini**       | Categorización con IA (aistudio.google.com/apikey) |
| **Vercel**       | Hosting (opcional; corre igual en local)           |

### Puesta en marcha

1. **Clona e instala**

   ```bash
   git clone <tu-fork>.git peso && cd peso
   npm install
   ```

2. **Base de datos.** Crea un proyecto en Supabase y, en el **SQL Editor**,
   ejecuta en orden **todos** los archivos de `supabase/migrations/`
   (`0001` → `0014`) y luego `supabase/seed.sql`. Si añades migraciones
   nuevas, corren igual: en orden numérico.

3. **Variables de entorno.** Copia `.env.example` a `.env.local` y complétalas.
   La guía detallada de cada una (cómo obtener las credenciales de Google,
   configurar Gmail Push, etc.) está en **[CLAUDE.md](CLAUDE.md)**.

   ```bash
   cp .env.example .env.local
   ```

4. **Corre**

   ```bash
   npm run dev
   ```

5. **Deploy (opcional).** Importa el repo en Vercel, define las mismas env vars
   en _Production_, y sigue la sección de **Gmail Push** del CLAUDE.md
   (necesita la URL real del deploy).

> **Antes de compartir tu instancia con alguien:** define
> `NEXT_PUBLIC_CONTACT_EMAIL`. Es el correo que aparece en `/privacy` y
> `/terms`, y sin él sale un placeholder (`tu-correo@ejemplo.com`). Esas dos
> páginas son públicas a propósito: Google exige una política de privacidad
> accesible sin login para conceder el scope `gmail.readonly`. Revisa su texto
> y ajústalo a lo que haga tu instancia.

> **Nota sobre Google:** operar sin la verificación formal de Google significa
> que cada usuario ve una pantalla de "app no verificada" (hay que tocar
> _Avanzado → Continuar_) y hay un tope de 100 usuarios por proyecto. Para una
> instancia personal o de amigos es de sobra. Detalles en el CLAUDE.md.

---

## Comandos

```bash
npm run dev        # servidor de desarrollo
npm run build      # build de producción
npm run lint       # ESLint
npx vitest run     # tests (parsers de correos)
npx prettier --write .   # formatear
```

## Documentación completa

El **[CLAUDE.md](CLAUDE.md)** es la referencia profunda: arquitectura, flujo de
datos, cada variable de entorno, configuración paso a paso de Google Cloud y
Gmail Push, los parsers de cada banco y las decisiones técnicas (y por qué).

## Licencia

[MIT](LICENSE) — úsala, modifícala y despliega tu propia instancia libremente.
