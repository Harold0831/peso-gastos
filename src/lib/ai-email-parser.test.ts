import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEmailWithAi } from "./gemini";

/**
 * La IA leyendo correos bancarios es la red que se activa cuando el parser de
 * regex de un banco deja de funcionar. Estos tests no comprueban que Gemini
 * acierte —eso no se puede— sino lo contrario: que NADA de lo que devuelva
 * pueda convertirse en una transacción a medias.
 *
 * Es la diferencia entre una red y un agujero. Una fila con monto 0, sin
 * comercio o con una fecha inventada es peor que no registrar nada: ensucia el
 * saldo, el mes y los presupuestos, y el usuario no tiene forma de saber de
 * dónde salió.
 */

const RECIBIDO = new Date("2026-09-11T14:30:00.000Z");

/** Hace que la llamada a Gemini devuelva este JSON, sin tocar la red. */
function respondeGemini(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
    })),
  );
}

function entrada() {
  return {
    bank: "Banco Popular",
    subject: "Notificación de Consumo",
    body: "…",
    receivedAt: RECIBIDO,
  };
}

const TRANSACCION_VALIDA = {
  is_transaction: true,
  type: "expense",
  merchant: "SUPERMERCADO NACIONAL",
  amount: 2840.5,
  currency: "DOP",
  date: "2026-09-11T10:15:00-04:00",
  card_last4: "3326",
};

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parseEmailWithAi", () => {
  it("lee una transacción completa", async () => {
    respondeGemini(TRANSACCION_VALIDA);
    const result = await parseEmailWithAi(entrada());

    expect(result).toMatchObject({
      type: "expense",
      merchant: "SUPERMERCADO NACIONAL",
      amount: 2840.5,
      currency: "DOP",
      card_last4: "3326",
    });
    // Nunca trae balance: ese campo solo lo saben los parsers que conocen el
    // formato, y confundirlo con el monto es justo el error a evitar.
    expect(result?.available_balance).toBeNull();
  });

  it("no inventa una transacción de un correo que no lo es", async () => {
    // Estado de cuenta, clave de un solo uso, promoción, compra declinada…
    respondeGemini({ ...TRANSACCION_VALIDA, is_transaction: false });
    expect(await parseEmailWithAi(entrada())).toBeNull();
  });

  it("rechaza lo que le falte un campo mínimo", async () => {
    for (const roto of [
      { amount: null },
      { amount: 0 },
      { amount: -50 },
      { type: null },
      { merchant: null },
      { merchant: "   " },
    ]) {
      respondeGemini({ ...TRANSACCION_VALIDA, ...roto });
      expect(await parseEmailWithAi(entrada()), JSON.stringify(roto)).toBeNull();
    }
  });

  it("una fecha inventada cae a la de recepción en vez de romper el mes", async () => {
    // Una fecha basura pondría la transacción en 1970 o en "Invalid Date", y
    // desaparecería de la pantalla del mes sin que nadie supiera por qué.
    respondeGemini({ ...TRANSACCION_VALIDA, date: "el martes pasado" });
    expect((await parseEmailWithAi(entrada()))?.date).toEqual(RECIBIDO);

    respondeGemini({ ...TRANSACCION_VALIDA, date: null });
    expect((await parseEmailWithAi(entrada()))?.date).toEqual(RECIBIDO);
  });

  it("sin moneda asume DOP, que es la de los bancos que soporta", async () => {
    respondeGemini({ ...TRANSACCION_VALIDA, currency: null });
    expect((await parseEmailWithAi(entrada()))?.currency).toBe("DOP");
  });

  it("limpia los últimos 4 de la tarjeta y tolera que no vengan", async () => {
    respondeGemini({ ...TRANSACCION_VALIDA, card_last4: "49***...3326" });
    expect((await parseEmailWithAi(entrada()))?.card_last4).toBe("3326");

    respondeGemini({ ...TRANSACCION_VALIDA, card_last4: null });
    expect((await parseEmailWithAi(entrada()))?.card_last4).toBeNull();
  });

  it("no se cae si Gemini devuelve basura en vez de JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "lo siento, no sé" }] } }],
        }),
      })),
    );
    expect(await parseEmailWithAi(entrada())).toBeNull();
  });

  it("no se cae si Gemini falla o no hay API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 429, text: async () => "quota" })),
    );
    expect(await parseEmailWithAi(entrada())).toBeNull();

    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await parseEmailWithAi(entrada())).toBeNull();
  });
});
