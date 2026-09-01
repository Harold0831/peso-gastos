import { describe, expect, it } from "vitest";
import { monthToParam, parseMonthParam } from "./month-param";

describe("monthToParam", () => {
  it("serializa con el mes en dos dígitos", () => {
    expect(monthToParam(new Date(2026, 0, 15))).toBe("2026-01");
    expect(monthToParam(new Date(2026, 8, 1))).toBe("2026-09");
    expect(monthToParam(new Date(2026, 11, 31))).toBe("2026-12");
  });
});

describe("parseMonthParam", () => {
  it("devuelve el primer día del mes pedido", () => {
    const d = parseMonthParam("2026-03");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // marzo
    expect(d.getDate()).toBe(1);
  });

  it("interpreta el mes en hora LOCAL, no UTC", () => {
    // Con `new Date("2026-03")` (UTC) esto daría febrero en República
    // Dominicana (UTC-4) y la lista mostraría el mes equivocado.
    expect(parseMonthParam("2026-03").getMonth()).toBe(2);
  });

  it("es ida y vuelta con monthToParam", () => {
    for (const param of ["2024-01", "2026-09", "2030-12"]) {
      expect(monthToParam(parseMonthParam(param))).toBe(param);
    }
  });

  const ahora = new Date();
  const esMesActual = (d: Date) =>
    d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();

  it("cae al mes actual sin parámetro", () => {
    expect(esMesActual(parseMonthParam(undefined))).toBe(true);
    expect(esMesActual(parseMonthParam(null))).toBe(true);
    expect(esMesActual(parseMonthParam(""))).toBe(true);
  });

  it("cae al mes actual con basura en la URL, sin lanzar", () => {
    // El parámetro lo puede escribir cualquiera: nunca debe romper la página.
    for (const basura of ["hola", "2026", "2026-13", "2026-00", "1999-05", "3000-01", "26-9"]) {
      expect(esMesActual(parseMonthParam(basura)), basura).toBe(true);
    }
  });
});
