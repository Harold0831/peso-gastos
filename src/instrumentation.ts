/**
 * Avisa al webhook de monitoreo cuando una LECTURA revienta en el servidor.
 *
 * Por qué existe (2026-09-14): la app avisaba de los fallos del SYNC y de nada
 * más. Cuando Supabase empezó a devolver 502, a un usuario le salió la pantalla
 * de "Algo salió mal al cargar esto" y quien opera la instancia se enteró
 * porque el amigo le mandó una CAPTURA. Es el mismo fallo mudo que el
 * monitoreo del sync vino a cerrar, pero del lado de las pantallas.
 *
 * `onRequestError` es el punto de Next.js donde aterriza cualquier excepción
 * del servidor —server components, server actions, route handlers— con su
 * `digest`. Ese digest es exactamente el número que la persona ve en pantalla,
 * así que el aviso y la captura se pueden cruzar sin adivinar nada.
 *
 * No reemplaza los logs de Vercel (ahí sigue el stack completo): sirve para
 * ENTERARSE, que es lo que faltaba.
 */

/**
 * Freno en MEMORIA, y aquí sí es lo correcto — al revés que en `rate-limit.ts`,
 * donde el contador vive en Postgres porque un `Map` por instancia no sirve
 * para frenar a un atacante.
 *
 * El motivo es la causa más probable de estos errores: que Supabase no esté
 * respondiendo. En ese escenario `check_rate_limit()` **falla abierto** (no
 * puede consultar el contador), así que el throttle de `reportIssue` deja pasar
 * TODO y quince personas tocando la app llenan el canal de Discord con el mismo
 * mensaje. Un freno en memoria no depende de la base, que es justo lo que hace
 * falta cuando la base es el problema.
 */
const VENTANA_MS = 5 * 60 * 1000;
/** Tope de claves recordadas: sin él, un error distinto por ruta haría crecer
 *  el mapa sin fin en una instancia de larga vida. */
const MAX_CLAVES = 50;
const ultimoAviso = new Map<string, number>();

function debeAvisar(clave: string): boolean {
  const ahora = Date.now();
  const previo = ultimoAviso.get(clave);
  if (previo !== undefined && ahora - previo < VENTANA_MS) return false;

  if (ultimoAviso.size >= MAX_CLAVES) {
    for (const [k, t] of ultimoAviso) {
      if (ahora - t >= VENTANA_MS) ultimoAviso.delete(k);
    }
    // Si tras limpiar sigue lleno, suelta la más antigua.
    if (ultimoAviso.size >= MAX_CLAVES) {
      const masVieja = [...ultimoAviso.entries()].sort((a, b) => a[1] - b[1])[0];
      if (masVieja) ultimoAviso.delete(masVieja[0]);
    }
  }
  ultimoAviso.set(clave, ahora);
  return true;
}

/** Excepciones que Next.js usa como control de flujo, no como fallo. */
function esControlDeFlujo(digest: unknown): boolean {
  return typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(digest);
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  // El monitoreo usa Supabase (para el throttle) y `server-only`: en el
  // runtime edge —donde corre el middleware— ni se intenta.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const digest = (error as { digest?: unknown })?.digest;
  if (esControlDeFlujo(digest)) return;

  const mensaje = error instanceof Error ? error.message : String(error);
  const ruta = context?.routePath ?? request?.path ?? "(ruta desconocida)";

  // Se agrupa por digest: el mismo error repitiéndose es UN aviso, no treinta.
  if (!debeAvisar(typeof digest === "string" ? digest : `${ruta}::${mensaje}`)) return;

  try {
    const { reportIssue } = await import("./lib/monitoring");
    await reportIssue({
      context: "error al cargar una pantalla",
      message: `${request?.method ?? "GET"} ${ruta} falló y el usuario vio la pantalla de error.`,
      details: [
        mensaje,
        // El mismo número que sale en pantalla bajo "Código del error".
        typeof digest === "string" ? `Código del error: ${digest}` : "Sin digest",
      ],
    });
  } catch (err) {
    // Un aviso que falla jamás puede empeorar la petición que ya venía rota.
    console.error("[onRequestError] no se pudo avisar:", err);
  }
}
