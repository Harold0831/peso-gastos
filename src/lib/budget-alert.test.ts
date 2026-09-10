import { describe, expect, it } from "vitest";
import { WARN_THRESHOLD, budgetAlertBody, detectBudgetCrossing } from "./budget-alert";

describe("detectBudgetCrossing", () => {
  it("avisa al cruzar el 80%", () => {
    // 7,000 de 10,000 → 8,500: cruza el 80%.
    expect(detectBudgetCrossing(10000, 8500, 1500)).toBe("warn");
  });

  it("avisa al pasarse del 100%", () => {
    expect(detectBudgetCrossing(10000, 10500, 1500)).toBe("over");
  });

  it("NO repite el aviso si ya estaba por encima", () => {
    // Lo que evita que cada gasto del mes vuelva a notificar lo mismo.
    expect(detectBudgetCrossing(10000, 9500, 500)).toBeNull(); // 90% → 95%
    expect(detectBudgetCrossing(10000, 12000, 1000)).toBeNull(); // 110% → 120%
  });

  it("un solo gasto que cruza los dos umbrales avisa del peor", () => {
    expect(detectBudgetCrossing(10000, 11000, 11000)).toBe("over");
  });

  it("no avisa si no se cruzó nada", () => {
    expect(detectBudgetCrossing(10000, 5000, 1000)).toBeNull();
  });

  it("sin presupuesto o sin gasto no hay aviso", () => {
    expect(detectBudgetCrossing(0, 5000, 1000)).toBeNull();
    expect(detectBudgetCrossing(10000, 9000, 0)).toBeNull();
    expect(detectBudgetCrossing(10000, 9000, -500)).toBeNull();
  });

  it("justo EN el umbral cuenta como cruzarlo", () => {
    expect(detectBudgetCrossing(10000, 10000 * WARN_THRESHOLD, 100)).toBe("warn");
    expect(detectBudgetCrossing(10000, 10000, 100)).toBe("over");
  });
});

describe("budgetAlertBody", () => {
  it("el aviso de excedido dice cuánto de cuánto", () => {
    expect(budgetAlertBody("over", "Alimentación", "RD$ 10,500.00", "RD$ 10,000.00", 105)).toBe(
      "Superaste el presupuesto de Alimentación: RD$ 10,500.00 de RD$ 10,000.00",
    );
  });

  it("el aviso temprano dice el porcentaje", () => {
    expect(budgetAlertBody("warn", "Transporte", "RD$ 8,500.00", "RD$ 10,000.00", 85)).toBe(
      "Vas por el 85% del presupuesto de Transporte",
    );
  });
});
