/**
 * `fetch` con reintentos para los fallos TRANSITORIOS del gateway de Supabase.
 *
 * Por qué existe (2026-09-14, visto en producción): Supabase devolvió
 * `502 Bad Gateway` y `504 Gateway Timeout` en ráfagas de unos segundos.
 * `supabase-js` no reintenta nada, así que ese 502 llegaba tal cual a
 * `data.ts`, que lanza — y el usuario veía la pantalla de "Algo salió mal al
 * cargar esto" en una consulta que solo pedía UNA fila por índice. El mismo
 * hipo tumbaba el webhook de Gmail con un 500.
 *
 * Lo que estos errores tienen en común es que **no son de la consulta**: es la
 * puerta de entrada la que no atendió. Repetir medio segundo después suele
 * bastar, y es mejor que enseñarle un error a alguien que solo abrió la lista.
 *
 * **Solo se reintentan los GET**, y eso no es prudencia decorativa: ante un 502
 * no se sabe si la petición llegó a aplicarse. Repetir un `insert` podría
 * duplicar una transacción — justo el tipo de fallo que esta app lleva
 * arreglado dos veces. Un `select` se puede repetir mil veces sin consecuencia,
 * y da la casualidad de que PostgREST usa GET para todas las lecturas, que es
 * de donde salieron los dos síntomas.
 */

/** Estados del GATEWAY, no de la consulta. Un 400 o un 500 de PostgREST
 *  significan que la petición sí llegó y algo real falló: repetirla no
 *  cambiaría el resultado y solo retrasaría el error. */
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

/** Esperas entre intentos. Dos reintentos: si a los ~800ms sigue sin
 *  responder, no es un hipo y hacer esperar más a la persona no ayuda. */
const DEFAULT_DELAYS_MS = [200, 600];

function isRetryableMethod(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase() === "GET";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Construye el `fetch` con reintentos. Los parámetros existen para los tests
 * (esperas a cero y un `fetch` de mentira); en producción se usa el que
 * exporta `fetchWithRetry`.
 */
export function createRetryingFetch(options?: {
  delaysMs?: number[];
  fetchImpl?: typeof fetch;
}): typeof fetch {
  const delays = options?.delaysMs ?? DEFAULT_DELAYS_MS;
  const doFetch = options?.fetchImpl ?? fetch;

  return async function retryingFetch(input, init) {
    const retryable = isRetryableMethod(input, init);

    for (let attempt = 0; ; attempt++) {
      const lastAttempt = attempt >= delays.length;
      try {
        const response = await doFetch(input, init);
        if (!retryable || lastAttempt || !RETRYABLE_STATUSES.has(response.status)) {
          return response;
        }
        // Vaciar el cuerpo antes de reintentar libera la conexión.
        await response.arrayBuffer().catch(() => {});
      } catch (err) {
        // Un abort es una decisión de quien llama (timeout propio, navegación
        // cancelada), no un fallo del gateway: reintentarlo sería desobedecer.
        const aborted = err instanceof Error && err.name === "AbortError";
        if (!retryable || lastAttempt || aborted) throw err;
      }
      await sleep(delays[attempt]);
    }
  };
}

export const fetchWithRetry = createRetryingFetch();
