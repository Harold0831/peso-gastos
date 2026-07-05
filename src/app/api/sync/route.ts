import { NextResponse, type NextRequest } from "next/server";
import { runSyncAll } from "@/lib/sync";
import { isSupabaseConfigured } from "@/lib/supabase";

export const maxDuration = 60;

/**
 * Endpoint de sincronización para llamadas externas (curl, atajos de iOS…).
 * Requiere "Authorization: Bearer $SYNC_SECRET". Sincroniza TODOS los
 * usuarios con Gmail vinculado. El botón "Sincronizar" de /transactions usa
 * la server action syncNow(), que sincroniza solo al usuario en sesión.
 *
 * Acepta ?days=N para un backfill puntual con una ventana más amplia que
 * el default de 7 días (ej. tras agregar soporte para un remitente que no
 * se estaba sincronizando). En Vercel corre con maxDuration=60, así que un
 * backfill grande (cientos de correos) puede excederlo — para eso, mejor
 * correrlo local con `npm run dev` primero.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Number(daysParam) : undefined;

  try {
    const result = await runSyncAll(days);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { synced: 0, errors: [err instanceof Error ? err.message : "Error desconocido"] },
      { status: 500 },
    );
  }
}
