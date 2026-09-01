import { NextResponse } from "next/server";
import { getAllTransactionsForExport } from "@/lib/data";
import { csvFilename, transactionsToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * Descarga TODAS las transacciones del usuario en sesión como CSV.
 *
 * No está en PUBLIC_PATHS del middleware, así que exige sesión como
 * cualquier pantalla de la app; `getAllTransactionsForExport()` acota además
 * al `user_id` de esa sesión, así que no hay forma de pedir los datos de otro
 * (no acepta ningún parámetro).
 *
 * En modo demo exporta los datos mock en vez de dar error: es una LECTURA, y
 * el resto de la app también es navegable sin Supabase. Los errores amables
 * de modo demo son para las mutaciones, que sí necesitan dónde escribir.
 */
export async function GET() {
  try {
    const transactions = await getAllTransactionsForExport();
    const csv = transactionsToCsv(transactions);

    return new NextResponse(csv, {
      headers: {
        // charset=utf-8 + el BOM que pone transactionsToCsv: entre los dos,
        // los acentos sobreviven tanto al navegador como a Excel.
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename()}"`,
        // Son datos financieros: que no queden en ninguna caché intermedia.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (err) {
    console.error("[api/export]", err);
    return NextResponse.json({ error: "No se pudo generar la exportación." }, { status: 500 });
  }
}
