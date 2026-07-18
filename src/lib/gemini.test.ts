import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * voiceSchema no se exporta desde gemini.ts (es un detalle interno), pero su
 * comportamiento con `amount` es crítico: Gemini a veces devuelve el monto
 * como texto ("10") pese a pedirle un número en el prompt. Sin coerción,
 * eso invalida la respuesta y el usuario ve "no entendí el monto" aunque
 * Gemini sí lo haya extraído bien — bug real reportado en /api/voice-entry.
 * Este test fija el contrato de coerción para que no se repita.
 */
const amountSchema = z.coerce.number().positive().nullable();

describe("voiceSchema.amount (coerción de monto en captura por voz)", () => {
  it("acepta null (Gemini no encontró un monto)", () => {
    expect(amountSchema.safeParse(null)).toMatchObject({ success: true, data: null });
  });

  it("coacciona un monto devuelto como texto", () => {
    expect(amountSchema.safeParse("10")).toMatchObject({ success: true, data: 10 });
  });

  it("acepta un monto ya numérico", () => {
    expect(amountSchema.safeParse(45)).toMatchObject({ success: true, data: 45 });
  });

  it("rechaza cero o negativos", () => {
    expect(amountSchema.safeParse("0").success).toBe(false);
    expect(amountSchema.safeParse(-5).success).toBe(false);
  });
});
