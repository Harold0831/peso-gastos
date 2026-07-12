import { describe, expect, it } from "vitest";
import { transactionSchema } from "./schemas";

describe("transactionSchema — monto con separador decimal", () => {
  const base = {
    type: "expense" as const,
    merchant: "Súper",
    date: "2026-07-12T17:30",
    category: "Alimentación",
  };

  const amountOf = (amount: string) => {
    const r = transactionSchema.safeParse({ ...base, amount });
    if (!r.success) throw new Error(r.error.issues[0].message);
    return r.data.amount;
  };

  it("acepta punto decimal (formato US)", () => {
    expect(amountOf("12.50")).toBe(12.5);
  });

  it("acepta coma decimal (formato europeo/español)", () => {
    expect(amountOf("12,50")).toBe(12.5);
  });

  it("acepta miles con punto y decimal con coma (1.234,56)", () => {
    expect(amountOf("1.234,56")).toBe(1234.56);
  });

  it("acepta enteros", () => {
    expect(amountOf("45")).toBe(45);
  });

  it("rechaza vacío o no numérico", () => {
    expect(transactionSchema.safeParse({ ...base, amount: "" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
  });

  it("acepta EUR como moneda", () => {
    const r = transactionSchema.safeParse({ ...base, amount: "10", currency: "EUR" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currency).toBe("EUR");
  });
});
