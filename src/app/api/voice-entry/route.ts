import { NextResponse, type NextRequest } from "next/server";
import { resolveUserIdFromToken } from "@/lib/api-token";
import { getHomeCurrencyForUser } from "@/lib/users";
import { getCategories } from "@/lib/data";
import { parseVoiceEntry } from "@/lib/gemini";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { voiceEntrySchema } from "@/lib/schemas";

export const maxDuration = 30;

/**
 * Captura de gastos desde un Shortcut de iOS, sin sesión interactiva.
 * Auth por token: "Authorization: Bearer <token>" (ver lib/api-token.ts).
 *
 * Dos modos:
 *  - quick:   { mode, category, amount, description? } → inserta directo.
 *  - dictate: { mode, text } → Gemini extrae monto/descripción/categoría.
 *
 * Siempre: moneda = la de casa del usuario (EUR para la cuenta de España),
 * fecha = hoy, source = 'voice', confirmed = true (la notificación del
 * Shortcut es la confirmación). Responde con lo que se guardó para mostrarlo.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Servidor no configurado" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const userId = await resolveUserIdFromToken(token);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const parsed = voiceEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  }

  const categories = (await getCategories()).map((c) => c.name);
  const currency = await getHomeCurrencyForUser(userId);

  let amount: number;
  let category: string;
  let description: string;

  if (parsed.data.mode === "quick") {
    if (!categories.includes(parsed.data.category)) {
      return NextResponse.json(
        { ok: false, error: `Categoría desconocida: ${parsed.data.category}` },
        { status: 400 },
      );
    }
    amount = parsed.data.amount;
    category = parsed.data.category;
    description = parsed.data.description || parsed.data.category;
  } else {
    const entry = await parseVoiceEntry({
      text: parsed.data.text,
      availableCategories: categories,
    });
    if (!entry) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No entendí el monto. Repite indicando la cantidad, ej. "12 euros en el súper".',
        },
        { status: 422 },
      );
    }
    amount = entry.amount;
    category = entry.category;
    description = entry.description;
  }

  const { error } = await getSupabaseAdmin().from("transactions").insert({
    user_id: userId,
    type: "expense",
    merchant: description,
    amount,
    currency,
    date: new Date().toISOString(),
    category,
    confirmed: true,
    source: "voice",
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    saved: { amount, currency, category, description },
  });
}
