"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { requireUserId } from "./users";
import {
  budgetSchema,
  bulkConfirmSchema,
  confirmSchema,
  contributionSchema,
  enabledBanksSchema,
  goalSchema,
  pushSubscriptionSchema,
  transactionSchema,
} from "./schemas";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MOCK_MODE_ERROR = "Modo demo: configura Supabase en .env.local para guardar cambios reales.";

/**
 * Convierte errores crudos de Supabase/PostgREST (en inglés técnico, ej.
 * "duplicate key value violates unique constraint …") en un mensaje humano
 * en español. El detalle original va a console.error — visible en los logs
 * de Vercel para depurar, invisible para el usuario.
 */
function friendlyDbError(error: { code?: string; message: string }, context: string): string {
  console.error(`[${context}]`, error.code ?? "", error.message);
  if (error.code === "23505") return "Ya existe un registro igual — revisa si está duplicado.";
  if (/fetch failed|network|timeout/i.test(error.message)) {
    return "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.";
  }
  return "No se pudo guardar. Intenta de nuevo en un momento.";
}

function revalidateAll() {
  for (const path of ["/", "/transactions", "/charts", "/budget", "/goals"]) {
    revalidatePath(path);
  }
}

/**
 * Push si al confirmar gasto(s) el presupuesto de la categoría cruzó el
 * 80% o el 100%. Vive en la confirmación (no en el sync) a propósito: las
 * pendientes no cuentan al presupuesto hasta que se confirman. Solo avisa
 * al CRUZAR el umbral (antes < umbral ≤ después) — nunca repite el aviso
 * en cada gasto siguiente. Fallo suave: jamás rompe la confirmación.
 */
async function maybeNotifyBudgetThreshold(categoryName: string, txIds: string[]): Promise<void> {
  try {
    const { getBudgetsForMonth, getHomeCurrency } = await import("./data");
    const { sendPushToUser } = await import("./push");
    const { formatMoney } = await import("./format");

    const userId = await requireUserId();
    const [budgets, home] = await Promise.all([getBudgetsForMonth(new Date()), getHomeCurrency()]);
    const entry = budgets.find((b) => b.category.name === categoryName);
    if (!entry || entry.budget.limit_amount <= 0) return;

    // Monto recién confirmado (en moneda de casa) para reconstruir el "antes"
    const { data: rows } = await getSupabaseAdmin()
      .from("transactions")
      .select("amount, currency, exchange_rate, type")
      .in("id", txIds)
      .eq("user_id", userId);
    const added = (rows ?? [])
      .filter((r) => r.type === "expense")
      .reduce(
        (s, r) =>
          s + (r.currency === home ? Number(r.amount) : Number(r.amount) * (r.exchange_rate ?? 1)),
        0,
      );
    if (added <= 0) return;

    const limit = entry.budget.limit_amount;
    const after = entry.spent / limit;
    const before = (entry.spent - added) / limit;

    let body: string | null = null;
    if (before < 1 && after >= 1) {
      body = `Superaste el presupuesto de ${categoryName}: ${formatMoney(entry.spent, home)} de ${formatMoney(limit, home)}`;
    } else if (before < 0.8 && after >= 0.8) {
      body = `Vas por el ${Math.round(after * 100)}% del presupuesto de ${categoryName}`;
    }
    if (!body) return;

    await sendPushToUser(userId, { title: "⚠️ Presupuesto", body, url: "/budget" });
  } catch (err) {
    console.error("[maybeNotifyBudgetThreshold]", err);
  }
}

export async function confirmTransaction(input: unknown): Promise<ActionResult> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("transactions")
    .update({
      category: parsed.data.category,
      notes: parsed.data.notes || null,
      confirmed: true,
      ...(parsed.data.amount !== undefined && { amount: parsed.data.amount }),
      ...(parsed.data.merchant !== undefined && { merchant: parsed.data.merchant }),
      ...(parsed.data.date !== undefined && { date: parsed.data.date }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
    })
    .eq("id", parsed.data.id)
    .eq("user_id", await requireUserId());
  if (error) return { ok: false, error: friendlyDbError(error, "confirmTransaction") };

  await maybeNotifyBudgetThreshold(parsed.data.category, [parsed.data.id]);
  revalidateAll();
  return { ok: true };
}

/**
 * Confirma varias transacciones a la vez con la misma categoría — útil
 * cuando llegan varias pendientes seguidas del mismo tipo (p. ej. varios
 * "Uber" o "PedidosYa" sugeridos como "Transporte"/"Alimentación") y no
 * tiene sentido confirmarlas una por una.
 */
export async function confirmTransactionsBulk(input: {
  ids: string[];
  category: string;
}): Promise<ActionResult> {
  const parsed = bulkConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("transactions")
    .update({ category: parsed.data.category, confirmed: true })
    .in("id", parsed.data.ids)
    .eq("user_id", await requireUserId());
  if (error) return { ok: false, error: friendlyDbError(error, "confirmTransactionsBulk") };

  await maybeNotifyBudgetThreshold(parsed.data.category, parsed.data.ids);
  revalidateAll();
  return { ok: true };
}

/**
 * Soft delete: no borra la fila. Un DELETE real deja libre el
 * gmail_message_id y el próximo sync (webhook o manual) vuelve a
 * encontrar ese correo en Gmail, no lo ve en la tabla y lo re-inserta
 * como si fuera nuevo — bug real (corregido el 2026-07-05): una
 * transacción eliminada volvía a aparecer sola después de un rato.
 */
export async function deleteTransaction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id de la transacción" };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", await requireUserId());
  if (error) return { ok: false, error: friendlyDbError(error, "deleteTransaction") };

  revalidateAll();
  return { ok: true };
}

/**
 * Deshace un soft delete (el "Deshacer" del toast al eliminar). Como
 * eliminar solo estampa deleted_at, restaurar es limpiarlo — la fila y su
 * gmail_message_id nunca se fueron.
 */
export async function restoreTransaction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Falta el id de la transacción" };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("transactions")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", await requireUserId());
  if (error) return { ok: false, error: friendlyDbError(error, "restoreTransaction") };

  revalidateAll();
  return { ok: true };
}

export async function createTransaction(input: unknown): Promise<ActionResult> {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  // La única tasa que conocemos es USD→DOP: estámpala solo en gastos USD
  // para que los totales en RD$ la usen (fallo suave a null → data.ts cae a
  // la última cacheada). En EUR no se estampa: un usuario de casa EUR ve sus
  // totales en EUR sin conversión, y no tenemos tasa EUR→DOP.
  let exchangeRate: number | null = null;
  if (parsed.data.currency === "USD") {
    const { getUsdToDopRate } = await import("./exchange-rate");
    exchangeRate = await getUsdToDopRate();
  }

  const { data: created, error } = await getSupabaseAdmin()
    .from("transactions")
    .insert({
      user_id: await requireUserId(),
      type: parsed.data.type,
      merchant: parsed.data.merchant,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      exchange_rate: exchangeRate,
      date: new Date(parsed.data.date).toISOString(),
      category: parsed.data.category,
      notes: parsed.data.notes || null,
      confirmed: true,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: friendlyDbError(error, "createTransaction") };

  if (parsed.data.type === "expense" && created) {
    await maybeNotifyBudgetThreshold(parsed.data.category, [created.id]);
  }
  revalidateAll();
  return { ok: true };
}

/** Guarda qué bancos sincronizar desde Gmail (perfil → "Mis bancos"). */
export async function setEnabledBanks(input: unknown): Promise<ActionResult> {
  const parsed = enabledBanksSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("gmail_accounts")
    .update({ enabled_banks: parsed.data.banks, updated_at: new Date().toISOString() })
    .eq("user_id", await requireUserId());
  if (error) return { ok: false, error: friendlyDbError(error, "setEnabledBanks") };

  revalidatePath("/profile");
  return { ok: true };
}

export async function createBudget(input: unknown): Promise<ActionResult> {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("budgets")
    .upsert(
      {
        user_id: await requireUserId(),
        category_id: parsed.data.category_id,
        month: parsed.data.month,
        limit_amount: parsed.data.limit_amount,
      },
      { onConflict: "user_id,category_id,month" },
    );
  if (error) return { ok: false, error: friendlyDbError(error, "createBudget") };

  revalidatePath("/budget");
  return { ok: true };
}

/**
 * Copia los presupuestos del mes anterior al mes indicado — cada mes
 * arranca vacío y recrearlos a mano era un ritual tedioso. Upsert: si ya
 * existe un presupuesto para una categoría este mes, se respeta el actual.
 */
export async function copyBudgetsFromPreviousMonth(month: string): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { ok: false, error: "Mes inválido" };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const supabase = getSupabaseAdmin();
  const userId = await requireUserId();

  const current = new Date(`${month}T00:00:00`);
  const prev = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;

  const { data: previous, error: readError } = await supabase
    .from("budgets")
    .select("category_id, limit_amount")
    .eq("user_id", userId)
    .eq("month", prevKey);
  if (readError) return { ok: false, error: friendlyDbError(readError, "copyBudgets") };
  if (!previous || previous.length === 0) {
    return { ok: false, error: "El mes pasado no tenía presupuestos que copiar" };
  }

  const { error } = await supabase.from("budgets").upsert(
    previous.map((b) => ({
      user_id: userId,
      category_id: b.category_id,
      month,
      limit_amount: b.limit_amount,
    })),
    { onConflict: "user_id,category_id,month", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: friendlyDbError(error, "copyBudgets") };

  revalidatePath("/budget");
  return { ok: true };
}

export async function createGoal(input: unknown): Promise<ActionResult> {
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("savings_goals")
    .insert({
      user_id: await requireUserId(),
      name: parsed.data.name,
      target_amount: parsed.data.target_amount,
      deadline: parsed.data.deadline || null,
      icon: parsed.data.icon,
    });
  if (error) return { ok: false, error: friendlyDbError(error, "createGoal") };

  revalidatePath("/goals");
  return { ok: true };
}

export async function contributeToGoal(input: unknown): Promise<ActionResult> {
  const parsed = contributionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const supabase = getSupabaseAdmin();
  const userId = await requireUserId();
  const { data: goal, error: readError } = await supabase
    .from("savings_goals")
    .select("current_amount")
    .eq("id", parsed.data.goal_id)
    .eq("user_id", userId)
    .single();
  if (readError) return { ok: false, error: friendlyDbError(readError, "contributeToGoal") };

  const { error } = await supabase
    .from("savings_goals")
    .update({ current_amount: Number(goal.current_amount) + parsed.data.amount })
    .eq("id", parsed.data.goal_id)
    .eq("user_id", userId);
  if (error) return { ok: false, error: friendlyDbError(error, "contributeToGoal") };

  revalidatePath("/goals");
  return { ok: true };
}

/** Sincroniza los correos de Qik del usuario actual (botón refresh de /transactions). */
export async function syncNow(): Promise<{ ok: boolean; synced: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { ok: false, synced: 0, error: MOCK_MODE_ERROR };
  }
  const { runSyncForUser } = await import("./sync");
  try {
    const result = await runSyncForUser(await requireUserId());
    revalidateAll();
    // Los "errors" no-fatales (p. ej. "sin Gmail vinculado") van como error suave
    if (result.synced === 0 && result.errors.length > 0) {
      return { ok: false, synced: 0, error: result.errors[0] };
    }
    return { ok: true, synced: result.synced };
  } catch (err) {
    return { ok: false, synced: 0, error: err instanceof Error ? err.message : "Error de sync" };
  }
}

/**
 * Desactiva el bloqueo con Face ID: borra los passkeys del usuario. Antes
 * no había forma de deshacer la activación — un callejón sin salida de UX.
 * El passkey es solo el bloqueo local opcional (el login es Google), así
 * que borrarlo no afecta el acceso a la cuenta.
 */
export async function disableFaceId(): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };
  const { deleteCredentialsForUser } = await import("./webauthn");
  try {
    await deleteCredentialsForUser(await requireUserId());
  } catch (err) {
    console.error("[disableFaceId]", err);
    return { ok: false, error: "No se pudo desactivar. Intenta de nuevo." };
  }
  revalidatePath("/profile");
  return { ok: true };
}

/** Registra este dispositivo para notificaciones push (perfil). */
export async function savePushSubscription(input: unknown): Promise<ActionResult> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: await requireUserId(),
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
      { onConflict: "endpoint" },
    );
  if (error) return { ok: false, error: friendlyDbError(error, "savePushSubscription") };
  return { ok: true };
}

/** Da de baja este dispositivo de las notificaciones push. */
export async function deletePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!endpoint) return { ok: false, error: "Falta el endpoint" };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", await requireUserId());
  if (error) return { ok: false, error: friendlyDbError(error, "deletePushSubscription") };
  return { ok: true };
}

/** Guarda feedback del usuario (botón en el perfil). */
export async function sendFeedback(message: string): Promise<ActionResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Escribe tu comentario primero" };
  if (trimmed.length > 2000) return { ok: false, error: "Máximo 2000 caracteres" };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("feedback")
    .insert({ user_id: await requireUserId(), message: trimmed });
  if (error) return { ok: false, error: friendlyDbError(error, "sendFeedback") };
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const { cookies } = await import("next/headers");
  (await cookies()).delete("peso_session");
  redirect("/login");
}
