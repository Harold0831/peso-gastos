import { describe, expect, it } from "vitest";
import { countsTowardBalance, startOfAstDay } from "./data";

/**
 * Un instante en hora de RD (AST = UTC-4) expresado en UTC.
 * Con Date.UTC y no armando la cadena a mano: sumar las 4 horas puede pasar
 * de las 24 y hay que rodar al día siguiente (8 p. m. AST ya es el día
 * siguiente en UTC — justo el caso que estos tests comprueban).
 */
function ast(day: string, hour: number, minute = 0): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date, hour + 4, minute)).toISOString();
}

describe("startOfAstDay", () => {
  it("parte el día a medianoche de RD, no del servidor (que corre en UTC)", () => {
    // 1 sep 8 p. m. AST ya es 2 sep en UTC: partir por UTC daría el día equivocado.
    expect(startOfAstDay(ast("2026-09-01", 20))).toBe("2026-09-01T04:00:00.000Z");
  });

  it("es estable a cualquier hora del mismo día de RD", () => {
    const inicio = startOfAstDay(ast("2026-09-01", 0));
    for (const hora of [0, 6, 12, 18, 23]) {
      expect(startOfAstDay(ast("2026-09-01", hora))).toBe(inicio);
    }
  });
});

describe("countsTowardBalance", () => {
  it("sin saldo fijado cuenta todo el historial", () => {
    expect(
      countsTowardBalance({ date: ast("2020-01-01", 12), created_at: ast("2020-01-01", 12) }, null),
    ).toBe(true);
  });

  it("BUG REPORTADO: transferencia recibida tras ajustar el saldo esa tarde", () => {
    // Harold ajusta el saldo a las 3 p. m. Llega una transferencia a las 5 p. m.,
    // pero su correo NO trae hora, así que el parser la estampa al MEDIODÍA.
    // Con la regla vieja (date > as_of) quedaba "antes" del ajuste y el saldo
    // no se movía. Es lo que este arreglo tiene que corregir.
    const ajuste = ast("2026-09-01", 15);
    const transferencia = { date: ast("2026-09-01", 12), created_at: ast("2026-09-01", 17) };
    expect(countsTowardBalance(transferencia, ajuste)).toBe(true);
  });

  it("no cuenta lo que ya estaba dentro del saldo tecleado (mismo día, antes)", () => {
    // Compra de la mañana, ya sincronizada cuando ajustaste el saldo: ese
    // gasto YA está reflejado en el número que escribiste.
    const ajuste = ast("2026-09-01", 15);
    const compra = { date: ast("2026-09-01", 9), created_at: ast("2026-09-01", 9, 30) };
    expect(countsTowardBalance(compra, ajuste)).toBe(false);
  });

  it("cuenta cualquier transacción de un día posterior", () => {
    const ajuste = ast("2026-09-01", 15);
    for (const hora of [0, 12, 23]) {
      const tx = { date: ast("2026-09-02", hora), created_at: ast("2026-09-02", hora) };
      expect(countsTowardBalance(tx, ajuste), `hora ${hora}`).toBe(true);
    }
  });

  it("cuenta una fecha futura aunque se registrara antes del ajuste", () => {
    // Alta manual con fecha de mañana, hecha antes de ajustar: el saldo del
    // banco que tecleaste no la incluye todavía.
    const ajuste = ast("2026-09-01", 15);
    const futura = { date: ast("2026-09-05", 12), created_at: ast("2026-09-01", 10) };
    expect(countsTowardBalance(futura, ajuste)).toBe(true);
  });

  it("un backfill de correos viejos NO infla el saldo", () => {
    // Esto es lo que protege la comparación por día: correos de meses atrás
    // sincronizados hoy con GET /api/sync?days=90. Ya están en el saldo real.
    const ajuste = ast("2026-09-01", 15);
    const vieja = { date: ast("2026-06-14", 12), created_at: ast("2026-09-01", 20) };
    expect(countsTowardBalance(vieja, ajuste)).toBe(false);
  });

  it("el corte del día es medianoche de RD, no de UTC", () => {
    // Ajuste a las 8 p. m. AST del 1 sep (que en UTC ya es 2 sep). Una
    // transacción de esa misma noche a las 9 p. m. sigue siendo del MISMO día
    // de RD, así que decide created_at — y llegó después, luego cuenta.
    const ajuste = ast("2026-09-01", 20);
    const tx = { date: ast("2026-09-01", 12), created_at: ast("2026-09-01", 21) };
    expect(countsTowardBalance(tx, ajuste)).toBe(true);

    // Y una del día ANTERIOR de RD no cuenta, aunque en UTC caiga el mismo día.
    const anterior = { date: ast("2026-08-31", 22), created_at: ast("2026-09-01", 21) };
    expect(countsTowardBalance(anterior, ajuste)).toBe(false);
  });

  it("compara en milisegundos, no como texto", () => {
    // Supabase devuelve "…+00:00" y toISOString() produce "…Z": comparar las
    // cadenas daría un resultado equivocado pese a ser el mismo instante.
    const ajuste = "2026-09-01T19:00:00.000Z";
    const tx = { date: "2026-09-01T16:00:00+00:00", created_at: "2026-09-01T21:00:00+00:00" };
    expect(countsTowardBalance(tx, ajuste)).toBe(true);
  });
});
