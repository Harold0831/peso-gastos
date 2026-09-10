import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { monthToParam, parseMonthParam, shiftMonthParam } from "./month-param";

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

describe("shiftMonthParam", () => {
  it("avanza y retrocede exactamente un mes", () => {
    expect(shiftMonthParam("2026-09", 1)).toBe("2026-10");
    expect(shiftMonthParam("2026-09", -1)).toBe("2026-08");
  });

  it("cruza el fin de año en ambos sentidos", () => {
    expect(shiftMonthParam("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthParam("2026-01", -1)).toBe("2025-12");
  });

  it("no salta meses por la longitud del mes (31 → 30 días)", () => {
    // La regresión: la versión vieja hacía subMonths/addMonths sobre un Date
    // que caía el día 31, y date-fns lo recortaba al 30 del mes siguiente,
    // desplazando el resultado. Con aritmética de calendario no puede pasar.
    for (const mes of ["2026-01", "2026-03", "2026-05", "2026-07", "2026-08", "2026-10"]) {
      const atras = shiftMonthParam(mes, -1);
      expect(shiftMonthParam(atras, 1), `${mes} → ${atras} → ida y vuelta`).toBe(mes);
    }
  });

  it("ir y volver siempre deja donde empezó", () => {
    for (const mes of ["2024-02", "2026-09", "2026-12", "2027-01"]) {
      expect(shiftMonthParam(shiftMonthParam(mes, 1), -1)).toBe(mes);
      expect(shiftMonthParam(shiftMonthParam(mes, -1), 1)).toBe(mes);
    }
  });

  it("basura en la URL cae al mes actual en vez de romper", () => {
    const ahora = new Date();
    const esperado = monthToParam(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
    expect(shiftMonthParam("basura", 0)).toBe(esperado);
  });
});

/**
 * BUG REAL del 2026-09-10, y la razón de que el mes viaje al cliente como
 * TEXTO y no como `Date`.
 *
 * El servidor (Vercel) corre en UTC. Cuando mandaba el mes como `Date`, "1 de
 * septiembre" cruzaba la frontera RSC como el instante 2026-09-01T00:00:00Z,
 * y el navegador dominicano (UTC-4) lo leía como el 31 de agosto a las
 * 8 p. m. Resultado: la cabecera decía "Agosto" mientras la lista mostraba
 * septiembre, ‹ saltaba dos meses y › no avanzaba nunca.
 *
 * Estos tests solo tienen sentido fuera de UTC — corren en AST por la
 * configuración de `vitest.config.ts`.
 */
describe("el mes no se corre por la zona horaria (regresión)", () => {
  const etiqueta = (d: Date) => format(d, "MMMM yyyy", { locale: es });

  it("el proceso NO corre en UTC, si no estos tests no probarían nada", () => {
    expect(new Date(2026, 8, 1).getTimezoneOffset()).not.toBe(0);
  });

  it("la etiqueta sale del texto del mes, sin corrimiento", () => {
    expect(etiqueta(parseMonthParam("2026-09"))).toBe("septiembre 2026");
    expect(etiqueta(parseMonthParam("2026-01"))).toBe("enero 2026");
  });

  it("demuestra el corrimiento que tenía la versión vieja", () => {
    // Lo que el servidor serializaba al mandar un Date al cliente.
    const instanteDelServidor = new Date("2026-09-01T00:00:00.000Z");
    // Leído en RD cae en agosto: ESTE era el bug.
    expect(etiqueta(instanteDelServidor)).toBe("agosto 2026");
    // Y desde el texto sale bien, que es lo que hace el código de hoy.
    expect(etiqueta(parseMonthParam("2026-09"))).toBe("septiembre 2026");
  });

  it("las flechas nunca calculan como destino el mes en el que ya estás", () => {
    // El síntoma exacto de › : el destino era la MISMA URL, así que la
    // navegación ocurría pero la pantalla no cambiaba nunca.
    for (const mes of ["2026-01", "2026-08", "2026-09", "2026-12"]) {
      expect(shiftMonthParam(mes, 1)).not.toBe(mes);
      expect(shiftMonthParam(mes, -1)).not.toBe(mes);
    }
  });
});
