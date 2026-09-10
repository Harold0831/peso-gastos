import { describe, expect, it } from "vitest";
import {
  MAX_AMOUNT_FACTOR,
  MIN_OCCURRENCES,
  buildMerchantRules,
  matchesRule,
  normalizeMerchant,
  type ConfirmedRow,
} from "./merchant-history";

/** Atajo: N filas del mismo comercio y categoría. */
function historial(merchant: string, category: string, amounts: number[]): ConfirmedRow[] {
  return amounts.map((amount) => ({ merchant, category, amount }));
}

describe("normalizeMerchant", () => {
  it("ignora mayúsculas y espacios de sobra", () => {
    expect(normalizeMerchant("  netflix  ")).toBe("NETFLIX");
    expect(normalizeMerchant("Supermercado   Nacional")).toBe("SUPERMERCADO NACIONAL");
  });

  it("NO junta comercios distintos que comparten prefijo", () => {
    // Caso real: el mismo agregador con restaurantes distintos, que pueden ir
    // a categorías distintas. La coincidencia es exacta a propósito.
    expect(normalizeMerchant("PedidosYa*Pizza Hut La")).not.toBe(
      normalizeMerchant("PedidosYa*Wendys"),
    );
  });
});

describe("buildMerchantRules", () => {
  it("no crea regla con una sola vez: eso es casualidad, no costumbre", () => {
    const rules = buildMerchantRules(historial("Netflix", "Entretenimiento", [649]));
    expect(rules.size).toBe(0);
  });

  it("crea la regla al llegar al mínimo de repeticiones", () => {
    const rules = buildMerchantRules(historial("Netflix", "Entretenimiento", [649, 649]));
    expect(rules.get("NETFLIX")).toMatchObject({
      category: "Entretenimiento",
      count: MIN_OCCURRENCES,
      maxAmount: 649,
    });
  });

  it("agrupa el mismo comercio escrito distinto", () => {
    const rules = buildMerchantRules([
      { merchant: "netflix", category: "Entretenimiento", amount: 649 },
      { merchant: "  NETFLIX ", category: "Entretenimiento", amount: 700 },
    ]);
    expect(rules.size).toBe(1);
    expect(rules.get("NETFLIX")?.maxAmount).toBe(700);
  });

  it("con categorías mezcladas gana la más frecuente", () => {
    // Nueve veces Transporte y una vez Trabajo: ese caso raro no debe imponerse
    // ni frenar la automatización.
    const rules = buildMerchantRules([
      ...historial("Uber", "Transporte", [200, 250, 300, 180, 220, 260, 240, 210, 190]),
      ...historial("Uber", "Trabajo", [500]),
    ]);
    expect(rules.get("UBER")?.category).toBe("Transporte");
    expect(rules.get("UBER")?.count).toBe(9);
  });

  it("el conteo es de la categoría ganadora, no del total", () => {
    // Una vez cada una: ninguna llega al mínimo, así que no hay regla — aunque
    // el comercio sume dos apariciones.
    const rules = buildMerchantRules([
      ...historial("Amazon", "Compras", [1000]),
      ...historial("Amazon", "Educación", [1000]),
    ]);
    expect(rules.size).toBe(0);
  });

  it("ignora filas sin categoría o sin comercio", () => {
    const rules = buildMerchantRules([
      { merchant: "Netflix", category: "", amount: 649 },
      { merchant: "", category: "Entretenimiento", amount: 649 },
      { merchant: "   ", category: "Entretenimiento", amount: 649 },
    ]);
    expect(rules.size).toBe(0);
  });

  it("sin historial no hay reglas", () => {
    expect(buildMerchantRules([]).size).toBe(0);
  });
});

describe("matchesRule", () => {
  const reglas = buildMerchantRules(historial("Netflix", "Entretenimiento", [649, 649, 649]));

  it("confirma un comercio conocido con monto normal", () => {
    expect(matchesRule({ merchant: "Netflix", amount: 649 }, reglas)).toEqual({
      category: "Entretenimiento",
    });
  });

  it("pregunta si el comercio no está en el historial", () => {
    expect(matchesRule({ merchant: "Comercio Nuevo", amount: 100 }, reglas)).toBeNull();
  });

  it("PROTECCIÓN: no confirma un monto muy por encima de lo habitual", () => {
    // La red de seguridad: confirmar también es tu oportunidad de ver un cargo
    // que no reconoces. Netflix siempre RD$649; un RD$6,490 tiene que
    // detenerse y preguntar.
    expect(matchesRule({ merchant: "Netflix", amount: 6490 }, reglas)).toBeNull();
  });

  it("acepta justo en el tope y rechaza justo encima", () => {
    const tope = 649 * MAX_AMOUNT_FACTOR;
    expect(matchesRule({ merchant: "Netflix", amount: tope }, reglas)).not.toBeNull();
    expect(matchesRule({ merchant: "Netflix", amount: tope + 0.01 }, reglas)).toBeNull();
  });

  it("un comercio variable tolera más, porque su historial ya lo dice", () => {
    // El supermercado va de RD$200 a RD$5,000: su propio máximo sube el tope,
    // sin configurar nada a mano.
    const supermercado = buildMerchantRules(
      historial("Supermercado Nacional", "Alimentación", [200, 800, 5000]),
    );
    expect(matchesRule({ merchant: "Supermercado Nacional", amount: 6000 }, supermercado)).toEqual({
      category: "Alimentación",
    });
    expect(matchesRule({ merchant: "Supermercado Nacional", amount: 15000 }, supermercado)).toBeNull();
  });

  it("un monto menor de lo habitual siempre pasa", () => {
    expect(matchesRule({ merchant: "Netflix", amount: 1 }, reglas)).not.toBeNull();
  });
});
