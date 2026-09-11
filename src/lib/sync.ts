import "server-only";
import { GmailAuthError, fetchBankEmails } from "./gmail";
import { reportIssue } from "./monitoring";
import {
  bankIdForSender,
  bankNameForSender,
  isIgnorableBankEmail,
  parseBankEmail,
  sendersForBanks,
} from "./bank-parser";
import { describeEmailStructure, labelsPresent } from "./email-structure";
import { saveFailedEmail } from "./failed-emails";
import { matchesRule } from "./merchant-history";
import { loadMerchantRules, visibleCategoryNames } from "./auto-confirm";
import { budgetAlertBody, detectBudgetCrossing } from "./budget-alert";
import { formatMoney } from "./format";
import { getHomeCurrencyForUser } from "./users";
import { htmlToText } from "./qik-parser";
import { parseEmailWithAi, suggestCategory } from "./gemini";
import { getSupabaseAdmin } from "./supabase";
import { decryptToken } from "./crypto";
import { getUsdToDopRate } from "./exchange-rate";
import { sendPushToUser } from "./push";
import type { Currency } from "./types";

/**
 * Tope de correos que la IA intenta leer por corrida. El sync vive en una
 * función serverless con 60s de límite y cada llamada a Gemini tarda uno o dos
 * segundos; sin tope, el día que un banco cambia el formato —que es
 * exactamente cuando esto se activa— cincuenta correos rotos agotarían el
 * tiempo y tumbarían el sync entero.
 */
const AI_PARSE_LIMIT = 8;

export interface SyncResult {
  synced: number;
  errors: string[];
}

interface GmailAccountRow {
  user_id: string;
  email: string;
  refresh_token_enc: string;
  sync_enabled: boolean;
  /** Ids de bank-parser.ts elegidos por el usuario; null = todos. */
  enabled_banks: string[] | null;
}

/**
 * Avisa si alguna transacción AUTO-CONFIRMADA cruzó el umbral del presupuesto
 * de su categoría.
 *
 * Sin esto, la auto-confirmación se comería en silencio una alerta que hoy sí
 * existe: el aviso de "80% del presupuesto" se dispara al CONFIRMAR (las
 * pendientes no cuentan al presupuesto), así que si Peso confirma solo y nadie
 * lo comprueba aquí, el usuario deja de enterarse justo con las transacciones
 * más frecuentes — que son las que más rápido consumen un presupuesto.
 *
 * No reusa `maybeNotifyBudgetThreshold` de actions.ts porque aquella corre con
 * la sesión abierta (`requireUserId()`) y el sync viene de un webhook. Lo que
 * SÍ comparten es la regla del umbral (`budget-alert.ts`), que es lo que no
 * puede divergir.
 *
 * `added` viene ya en moneda de casa. Fallo suave en todo: un aviso jamás
 * tumba un sync.
 */
async function notifyBudgetForAutoConfirmed(
  userId: string,
  home: Currency,
  addedByCategory: Map<string, number>,
): Promise<void> {
  if (addedByCategory.size === 0) return;

  try {
    const supabase = getSupabaseAdmin();

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

    const [{ data: budgets }, { data: categories }, { data: spentRows }] = await Promise.all([
      supabase
        .from("budgets")
        .select("category_id, limit_amount")
        .eq("user_id", userId)
        .eq("month", monthKey),
      supabase.from("categories").select("id, name").or(`user_id.is.null,user_id.eq.${userId}`),
      supabase
        .from("transactions")
        .select("category, amount, currency, exchange_rate")
        .eq("user_id", userId)
        .eq("type", "expense")
        .eq("confirmed", true)
        .is("deleted_at", null)
        .gte("date", from)
        .lte("date", to),
    ]);
    if (!budgets?.length) return;

    const nameById = new Map((categories ?? []).map((c) => [c.id as string, c.name as string]));
    const spentByCategory = new Map<string, number>();
    for (const row of spentRows ?? []) {
      const name = row.category as string | null;
      if (!name) continue;
      const amount =
        row.currency === home ? Number(row.amount) : Number(row.amount) * (row.exchange_rate ?? 1);
      spentByCategory.set(name, (spentByCategory.get(name) ?? 0) + amount);
    }

    for (const budget of budgets) {
      const name = nameById.get(budget.category_id as string);
      if (!name) continue;
      const added = addedByCategory.get(name);
      if (!added) continue;

      const limit = Number(budget.limit_amount);
      const spent = spentByCategory.get(name) ?? 0;
      const crossing = detectBudgetCrossing(limit, spent, added);
      if (!crossing) continue;

      await sendPushToUser(userId, {
        title: "Presupuesto",
        body: budgetAlertBody(
          crossing,
          name,
          formatMoney(spent, home),
          formatMoney(limit, home),
          Math.round((spent / limit) * 100),
        ),
        url: "/budget",
      });
    }
  } catch (err) {
    console.error("[notifyBudgetForAutoConfirmed]", err);
  }
}

/**
 * Pipeline de sincronización de UN usuario:
 *  1. Trae correos recientes de los remitentes de Qik (ver gmail.ts)
 *  2. Descarta los que ya existen para ese usuario (gmail_message_id)
 *  3. Parsea cada correo nuevo con regex
 *  4. Descarta si el usuario ya tiene una transacción con mismo
 *     monto/fecha/tipo (Qik notifica algunos movimientos por dos correos)
 *  5. Pide sugerencia de categoría a Gemini (falla suave → sin sugerencia)
 *  6. Inserta con confirmed=false
 *
 * Si el refresh token fue revocado (GmailAuthError), marca la cuenta con
 * sync_enabled=false — el perfil muestra "reconectar Gmail" y los crons
 * dejan de intentar con esa cuenta hasta que se reconecte.
 */
export async function runSyncForUser(
  userId: string,
  newerThanDays?: number,
  options?: {
    /** Push "N por confirmar" al terminar. true en los syncs automáticos
     *  (webhook/cron); false en el manual — el usuario ya está mirando. */
    notify?: boolean;
  },
): Promise<SyncResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];

  const { data: account, error: accountError } = await supabase
    .from("gmail_accounts")
    .select("user_id, email, refresh_token_enc, sync_enabled, enabled_banks")
    .eq("user_id", userId)
    .maybeSingle();
  if (accountError) throw new Error(`Error cargando cuenta de Gmail: ${accountError.message}`);
  if (!account) {
    return { synced: 0, errors: ["Este usuario no tiene Gmail vinculado"] };
  }

  let emails;
  try {
    emails = await fetchBankEmails(
      decryptToken(account.refresh_token_enc),
      newerThanDays,
      sendersForBanks(account.enabled_banks),
    );
  } catch (err) {
    if (err instanceof GmailAuthError) {
      await supabase.from("gmail_accounts").update({ sync_enabled: false }).eq("user_id", userId);
      return { synced: 0, errors: ["El acceso a Gmail expiró — reconéctalo desde tu perfil"] };
    }
    throw err;
  }
  if (emails.length === 0) return { synced: 0, errors };

  // Deliberadamente sin filtrar deleted_at: si el usuario eliminó la
  // transacción (soft delete), el correo sigue existiendo en Gmail y no
  // debe re-insertarse solo porque ya no aparece en la UI.
  const { data: existing, error: existingError } = await supabase
    .from("transactions")
    .select("gmail_message_id")
    .eq("user_id", userId)
    .in(
      "gmail_message_id",
      emails.map((e) => e.id),
    );
  if (existingError) {
    throw new Error(`Error consultando duplicados: ${existingError.message}`);
  }
  const known = new Set((existing ?? []).map((r) => r.gmail_message_id));
  const newEmails = emails.filter((e) => !known.has(e.id));
  if (newEmails.length === 0) return { synced: 0, errors };

  // Globales (seed) + las propias del usuario, menos las que ocultó, para que
  // Gemini pueda sugerir también las personalizadas sin resucitar una que el
  // usuario quitó de su lista.
  //
  // Las reglas de auto-confirmación (comercios que este usuario ya categorizó
  // varias veces) se arman UNA vez por corrida y no por correo: con 50 correos
  // nuevos, consultarlas dentro del bucle serían 50 consultas para construir
  // siempre lo mismo.
  const [categoryNames, autoConfirmRules] = await Promise.all([
    visibleCategoryNames(userId),
    loadMerchantRules(userId),
  ]);

  // Tasa USD→DOP del día, pedida una sola vez por corrida y solo si algún
  // correo viene en moneda extranjera. Fallo suave: sin tasa la transacción
  // se inserta igual con exchange_rate null (data.ts usa la última cacheada).
  let rateMemo: number | null | undefined;
  const getRate = async () => {
    if (rateMemo === undefined) rateMemo = await getUsdToDopRate();
    return rateMemo;
  };

  // Igual que la tasa: solo hace falta si algo se auto-confirma como gasto (el
  // aviso de presupuesto se compara en moneda de casa). Un sync que no
  // auto-confirma nada no paga esta consulta.
  let homeMemo: Currency | undefined;
  const getHome = async () => {
    if (homeMemo === undefined) homeMemo = await getHomeCurrencyForUser(userId);
    return homeMemo;
  };

  let synced = 0;
  let autoConfirmed = 0;
  /** Gasto auto-confirmado por categoría, en moneda de casa, para el aviso
   *  de presupuesto de después del bucle. */
  const autoExpenseByCategory = new Map<string, number>();
  // Asuntos cuyo esqueleto ya se adjuntó en esta corrida (ver más abajo).
  const described = new Set<string>();
  /** Llamadas a Gemini gastadas en leer correos rotos en esta corrida. */
  let aiAttempts = 0;
  for (const email of newEmails) {
    /** true si esta transacción la leyó la IA y no un parser de regex. Decide
     *  dos cosas más abajo: `source` y que NO pueda auto-confirmarse. */
    let readByAi = false;
    let parsed = parseBankEmail(email.from, email.subject, email.body, email.receivedAt);
    if (!parsed) {
      // Estados de cuenta, códigos CASH creados/vencidos, etc.: no son
      // transacciones y no representan un error de parseo.
      if (!isIgnorableBankEmail(email.from, email.subject, email.body)) {
        const bank = bankNameForSender(email.from);
        const encabezado = `[${bank}] "${email.subject}" — no se pudo parsear (correo ${email.id})`;

        // El esqueleto solo la PRIMERA vez que falla ese asunto en esta
        // corrida: tres "Notificación de Consumo" tienen la misma estructura,
        // y repetirla se comería el límite de tamaño del webhook sin aportar
        // nada. Las siguientes van con una línea y ya.
        const clave = `${bank}::${email.subject}`;
        if (described.has(clave)) {
          errors.push(encabezado);
        } else {
          described.add(clave);
          const text = /<[a-z][\s\S]*>/i.test(email.body) ? htmlToText(email.body) : email.body;
          errors.push(
            [
              encabezado,
              `Etiquetas encontradas: ${labelsPresent(text).join(", ") || "ninguna"}`,
              "Estructura (valores ocultos):",
              ...describeEmailStructure(text),
            ].join("\n"),
          );
        }

        // Guarda el correo COMPLETO, cifrado y con caducidad, para poder
        // arreglar el parser. El esqueleto de arriba dice qué etiquetas hay y
        // en qué orden, pero cuando un banco cambia el formato entero se queda
        // corto — con el Popular el aviso decía "Etiquetas encontradas:
        // ninguna", que no da con qué trabajar.
        //
        // Va DENTRO de este `if`, no fuera, y eso es la garantía de la que
        // depende la política de privacidad: aquí solo se llega si el correo
        // no se pudo parsear Y tampoco es ruido esperado. Un correo que sí se
        // leyó nunca pasa por esta línea.
        const primeraVez = await saveFailedEmail({
          userId,
          gmailMessageId: email.id,
          // El ID (`popular`), no el nombre: esta columna se FILTRA desde el
          // endpoint admin. Guardar "Banco Popular" hacía que `?bank=popular`
          // no devolviera nada aunque la tabla tuviera filas.
          bank: bankIdForSender(email.from),
          subject: email.subject,
          from: email.from,
          receivedAt: email.receivedAt,
          body: email.body,
        });

        // Red de seguridad: que el parser esté roto no debería costarle al
        // usuario la transacción. Gemini lee el correo y, si saca algo
        // coherente, entra COMO PENDIENTE — nunca auto-confirmada. Un modelo
        // de lenguaje leyendo el monto del dinero de alguien tiene que pasar
        // por ojos humanos antes de contar en un saldo o un presupuesto.
        //
        // Esto NO sustituye arreglar el parser: la muestra de arriba sigue
        // guardada justo para eso, y el aviso de Discord sigue saliendo. Los
        // parsers de regex son deterministas y están cubiertos por tests con
        // correos reales; esto solo tapa el hueco mientras tanto.
        //
        // Dos frenos, los dos aprendidos de para QUÉ existe esto: cuando un
        // banco cambia el formato fallan MUCHOS correos a la vez.
        //  - `primeraVez`: un correo que ni el regex ni la IA supieron leer
        //    vuelve a aparecer en cada sync para siempre (nunca se inserta,
        //    así que nunca queda registrado como visto). Sin este freno sería
        //    una llamada a Gemini por correo y por corrida, eternamente.
        //  - `AI_PARSE_LIMIT`: el sync corre en una función con 60s de tope
        //    (`maxDuration`). Cincuenta llamadas a Gemini en serie lo revientan
        //    y se cae el sync ENTERO — peor que el problema que viene a tapar.
        //    Lo que pasa del tope se queda como muestra guardada, que es lo que
        //    de verdad arregla el parser.
        const aiParsed =
          primeraVez && aiAttempts < AI_PARSE_LIMIT
            ? ((aiAttempts += 1),
              await parseEmailWithAi({
                bank,
                subject: email.subject,
                body: /<[a-z][\s\S]*>/i.test(email.body) ? htmlToText(email.body) : email.body,
                receivedAt: email.receivedAt,
              }))
            : null;
        if (aiParsed) {
          parsed = aiParsed;
          readByAi = true;
          errors.push(`[${bank}] "${email.subject}" — leído por IA, entró sin confirmar`);
        }
      }
      if (!parsed) continue;
    }

    // Qik a veces notifica el mismo movimiento por dos canales distintos
    // (p. ej. "Pago de servicio realizado" y, por separado, "Usaste tu
    // tarjeta…" para la misma factura pagada con débito) — mismo monto y
    // fecha/hora exacta pero gmail_message_id distinto, así que el chequeo
    // de duplicados de arriba no lo detecta. Sin esto se duplicaría el gasto.
    const { data: duplicate, error: dupError } = await supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("amount", parsed.amount)
      .eq("date", parsed.date.toISOString())
      .eq("type", parsed.type)
      .maybeSingle();
    if (dupError) throw new Error(`Error consultando duplicados: ${dupError.message}`);
    if (duplicate) continue;

    // ¿Comercio que el usuario ya categorizó varias veces? Entonces no hay
    // nada que preguntarle — ni a él ni a Gemini: su propio historial es más
    // confiable que una sugerencia de la IA, y encima sale gratis.
    // `readByAi` corta la auto-confirmación de raíz: el historial del usuario
    // puede reconocer el comercio, pero el monto y la fecha los sacó un modelo
    // de un formato que nadie ha verificado todavía.
    const auto = readByAi ? null : matchesRule(parsed, autoConfirmRules);
    // La categoría solo vale si sigue existiendo y visible para el usuario:
    // pudo haberla borrado u ocultado desde que la usó.
    const autoCategory = auto && categoryNames.includes(auto.category) ? auto.category : null;

    const suggestion = autoCategory
      ? null
      : await suggestCategory({
          merchant: parsed.merchant,
          amount: parsed.amount,
          currency: parsed.currency,
          type: parsed.type,
          availableCategories: categoryNames,
        });

    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: userId,
      gmail_message_id: email.id,
      type: parsed.type,
      merchant: parsed.merchant,
      amount: parsed.amount,
      currency: parsed.currency,
      exchange_rate: parsed.currency === "DOP" ? null : await getRate(),
      date: parsed.date.toISOString(),
      card_last4: parsed.card_last4,
      available_balance: parsed.available_balance,
      category: autoCategory,
      ai_suggested_category: suggestion?.category ?? null,
      confirmed: autoCategory !== null,
      auto_confirmed: autoCategory !== null,
      source: readByAi ? "ai" : "email",
      // `raw_email_snippet` ya NO se escribe (migración 0018): guardaba ~200
      // caracteres del cuerpo en cada fila, no se mostraba en ninguna parte y
      // contradecía la política de privacidad. Para depurar un parser está
      // `failed_emails`, que guarda el correo entero, cifrado y con caducidad,
      // y solo cuando de verdad falló.
    });

    if (insertError) {
      // 23505 = unique_violation: otro sync simultáneo lo insertó primero
      if (insertError.code !== "23505") {
        errors.push(`Error insertando ${email.id}: ${insertError.message}`);
      }
      continue;
    }
    synced++;

    if (autoCategory) {
      autoConfirmed++;
      if (parsed.type === "expense") {
        const inHome =
          parsed.currency === (await getHome())
            ? parsed.amount
            : parsed.amount * ((await getRate()) ?? 1);
        autoExpenseByCategory.set(
          autoCategory,
          (autoExpenseByCategory.get(autoCategory) ?? 0) + inHome,
        );
      }
    }
  }

  if (options?.notify && synced > 0) {
    const pending = synced - autoConfirmed;
    // El texto dice la verdad de lo que pasó: mandar a alguien a "confirmar"
    // una bandeja vacía porque todo se confirmó solo es peor que no avisar.
    const body =
      pending === 0
        ? synced === 1
          ? "1 transacción nueva, confirmada automáticamente"
          : `${synced} transacciones nuevas, confirmadas automáticamente`
        : autoConfirmed > 0
          ? `${synced} nuevas · ${pending} por confirmar`
          : pending === 1
            ? "1 transacción nueva por confirmar"
            : `${pending} transacciones nuevas por confirmar`;

    // Fallo suave: la notificación es un extra, nunca tumba el sync.
    await sendPushToUser(userId, {
      title: "Peso",
      body,
      url: pending > 0 ? "/transactions?filter=pendientes" : "/transactions",
    }).catch((err) => console.error("[sync] push falló:", err));
  }

  if (autoExpenseByCategory.size > 0) {
    await notifyBudgetForAutoConfirmed(userId, await getHome(), autoExpenseByCategory);
  }

  return { synced, errors };
}

/** Sincroniza al usuario dueño de una dirección de Gmail (webhook push). */
export async function runSyncForGmailAddress(email: string): Promise<SyncResult> {
  const { data: account, error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .select("user_id, sync_enabled")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Error buscando cuenta de Gmail: ${error.message}`);
  if (!account || !account.sync_enabled) {
    return { synced: 0, errors: [] }; // dirección desconocida o sync apagado: ignora
  }
  const result = await runSyncForUser(account.user_id, undefined, { notify: true });
  // La dirección va en el aviso porque sin ella el monitoreo es un callejón
  // sin salida: el correo que falló es de OTRA persona (el webhook dispara
  // para el buzón que cambió, no para el de quien recibe la alerta), así que
  // sin saber de quién es no hay forma de pedirle la muestra que hace falta
  // para arreglar el parser.
  await reportSyncErrors("sync automático (webhook)", {
    ...result,
    errors: result.errors.map((e) => `[${email.toLowerCase()}] ${e}`),
  });
  return result;
}

/**
 * Avisa si un sync AUTOMÁTICO dejó errores. Solo los automáticos: el manual
 * ya le enseña un toast al usuario, que está mirando la pantalla.
 *
 * Sin esto, un banco que cambia el formato de sus correos deja de importar
 * transacciones en silencio — los errores se acumulan en `SyncResult.errors`
 * y se devuelven en una respuesta JSON que nadie abre.
 */
async function reportSyncErrors(context: string, result: SyncResult): Promise<void> {
  if (result.errors.length === 0) return;
  await reportIssue({
    context,
    message: `${result.errors.length} correo(s) no se pudieron procesar (${result.synced} sincronizados).`,
    details: result.errors,
  });
}

/** Sincroniza todos los usuarios con Gmail vinculado (GET /api/sync). */
export async function runSyncAll(newerThanDays?: number): Promise<SyncResult> {
  const { data: accounts, error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .select("user_id, email, refresh_token_enc, sync_enabled, enabled_banks")
    .eq("sync_enabled", true);
  if (error) throw new Error(`Error listando cuentas de Gmail: ${error.message}`);

  let synced = 0;
  const errors: string[] = [];
  for (const account of (accounts ?? []) as GmailAccountRow[]) {
    try {
      const result = await runSyncForUser(account.user_id, newerThanDays, { notify: true });
      synced += result.synced;
      errors.push(...result.errors.map((e) => `[${account.email}] ${e}`));
    } catch (err) {
      errors.push(`[${account.email}] ${err instanceof Error ? err.message : "Error"}`);
    }
  }
  const result = { synced, errors };
  await reportSyncErrors("sync de todos los usuarios", result);
  return result;
}
