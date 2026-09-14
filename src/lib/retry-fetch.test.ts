import { describe, expect, it, vi } from "vitest";
import { createRetryingFetch } from "./retry-fetch";

/**
 * El caso que motiva todo esto: Supabase devolvió 502/504 en ráfagas y eso le
 * pintó a un usuario la pantalla de error en una consulta de una sola fila.
 *
 * Y el caso que este archivo vigila para que el arreglo no sea peor que el
 * problema: una ESCRITURA no se reintenta nunca.
 */

/** `fetch` de mentira: devuelve por turno lo que se le pase (estado o error). */
function fakeFetch(steps: (number | Error)[]) {
  const calls: { method: string }[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    calls.push({ method });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step instanceof Error) throw step;
    return new Response("{}", { status: step });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const sinEsperas = (fetchImpl: typeof fetch) =>
  createRetryingFetch({ delaysMs: [0, 0], fetchImpl });

describe("reintentos del gateway", () => {
  it("reintenta un GET con 502 y devuelve la respuesta buena", async () => {
    const { impl, calls } = fakeFetch([502, 200]);
    const res = await sinEsperas(impl)("https://x.supabase.co/rest/v1/transactions");
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("reintenta también el 504 (Gateway Timeout)", async () => {
    const { impl, calls } = fakeFetch([504, 200]);
    expect((await sinEsperas(impl)("https://x/rest")).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("reintenta una caída de red y devuelve la respuesta buena", async () => {
    const { impl, calls } = fakeFetch([new TypeError("fetch failed"), 200]);
    expect((await sinEsperas(impl)("https://x/rest")).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("se rinde tras los reintentos y devuelve el último 502", async () => {
    // No se esconde el fallo: si Supabase sigue caído, data.ts lanza igual y
    // el usuario ve el error. Lo que se evita es el hipo de medio segundo.
    const { impl, calls } = fakeFetch([502]);
    expect((await sinEsperas(impl)("https://x/rest")).status).toBe(502);
    expect(calls).toHaveLength(3); // el intento original + dos reintentos
  });
});

describe("lo que NO se reintenta", () => {
  it("una ESCRITURA no se repite nunca, ni con 502", async () => {
    // La garantía que sostiene todo esto: ante un 502 no se sabe si la
    // petición llegó a aplicarse, así que repetir un insert podría duplicar
    // una transacción. Es peor que el problema que se viene a arreglar.
    const { impl, calls } = fakeFetch([502, 200]);
    const res = await sinEsperas(impl)("https://x/rest", { method: "POST", body: "{}" });
    expect(res.status).toBe(502);
    expect(calls).toHaveLength(1);
  });

  it("tampoco un PATCH ni un DELETE", async () => {
    for (const method of ["PATCH", "DELETE"]) {
      const { impl, calls } = fakeFetch([503, 200]);
      const res = await sinEsperas(impl)("https://x/rest", { method });
      expect(res.status, method).toBe(503);
      expect(calls, method).toHaveLength(1);
    }
  });

  it("un error REAL de la consulta pasa tal cual, sin reintentos", async () => {
    // 400 y 500 significan que la petición sí llegó y algo real falló:
    // repetirla solo retrasaría el error.
    for (const status of [400, 404, 500]) {
      const { impl, calls } = fakeFetch([status, 200]);
      const res = await sinEsperas(impl)("https://x/rest");
      expect(res.status, String(status)).toBe(status);
      expect(calls, String(status)).toHaveLength(1);
    }
  });

  it("un abort de quien llama se respeta en vez de reintentarse", async () => {
    // Un AbortError es una decisión (un timeout propio, una navegación
    // cancelada), no un fallo del gateway.
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    const { impl, calls } = fakeFetch([abort, 200]);
    await expect(sinEsperas(impl)("https://x/rest")).rejects.toThrow(/aborted/);
    expect(calls).toHaveLength(1);
  });
});
