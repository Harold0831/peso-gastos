import { NextResponse, type NextRequest } from "next/server";
import { runSync } from "@/lib/sync";
import { isSupabaseConfigured } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * Endpoint de sincronización para llamadas externas (curl, atajos de iOS…).
 * Requiere "Authorization: Bearer $SYNC_SECRET". El botón "Sincronizar" de
 * /transactions usa la server action syncNow(), que ejecuta el mismo
 * runSync() sin exponer el secreto al cliente.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  try {
    const result = await runSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { synced: 0, errors: [err instanceof Error ? err.message : "Error desconocido"] },
      { status: 500 },
    );
  }
}
