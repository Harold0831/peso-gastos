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
  goalSchema,
  transactionSchema,
} from "./schemas";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const MOCK_MODE_ERROR = "Modo demo: configura Supabase en .env.local para guardar cambios reales.";

function revalidateAll() {
  for (const path of ["/", "/transactions", "/charts", "/budget", "/goals"]) {
    revalidatePath(path);
  }
}

export async function confirmTransaction(input: {
  id: string;
  category: string;
  notes?: string;
  amount?: number;
}): Promise<ActionResult> {
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
    })
    .eq("id", parsed.data.id)
    .eq("user_id", await requireUserId());
  if (error) return { ok: false, error: error.message };

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
  if (error) return { ok: false, error: error.message };

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
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true };
}

export async function createTransaction(input: unknown): Promise<ActionResult> {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("transactions")
    .insert({
      user_id: await requireUserId(),
      type: parsed.data.type,
      merchant: parsed.data.merchant,
      amount: parsed.data.amount,
      date: new Date(parsed.data.date).toISOString(),
      category: parsed.data.category,
      notes: parsed.data.notes || null,
      confirmed: true,
    });
  if (error) return { ok: false, error: error.message };

  revalidateAll();
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
  if (error) return { ok: false, error: error.message };

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
  if (error) return { ok: false, error: error.message };

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
  if (readError) return { ok: false, error: readError.message };

  const { error } = await supabase
    .from("savings_goals")
    .update({ current_amount: Number(goal.current_amount) + parsed.data.amount })
    .eq("id", parsed.data.goal_id)
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

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

/** Guarda feedback del usuario (botón en el perfil). */
export async function sendFeedback(message: string): Promise<ActionResult> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: "Escribe tu comentario primero" };
  if (trimmed.length > 2000) return { ok: false, error: "Máximo 2000 caracteres" };
  if (!isSupabaseConfigured()) return { ok: false, error: MOCK_MODE_ERROR };

  const { error } = await getSupabaseAdmin()
    .from("feedback")
    .insert({ user_id: await requireUserId(), message: trimmed });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const { cookies } = await import("next/headers");
  (await cookies()).delete("peso_session");
  redirect("/login");
}
