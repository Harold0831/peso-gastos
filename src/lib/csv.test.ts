import { describe, expect, it } from "vitest";
import { csvFilename, escapeCsvValue, formatCsvDate, transactionsToCsv } from "./csv";
import type { Transaction } from "./types";

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "tx-1",
    gmail_message_id: null,
    type: "expense",
    merchant: "Colmado",
    amount: 1234.5,
    currency: "DOP",
    exchange_rate: null,
    date: "2026-09-01T16:00:00.000Z",
    card_last4: null,
    available_balance: null,
    category: "Alimentación",
    ai_suggested_category: null,
    confirmed: true,
    notes: null,
    source: "manual",
    created_at: "2026-09-01T16:00:00.000Z",
    raw_email_snippet: null,
    deleted_at: null,
    ...overrides,
  } as Transaction;
}

describe("escapeCsvValue", () => {
  it("deja pasar tal cual lo que no necesita comillas", () => {
    expect(escapeCsvValue("Colmado")).toBe("Colmado");
    expect(escapeCsvValue(42)).toBe("42");
  });

  it("entrecomilla los valores con coma", () => {
    // El caso real: los nombres de comercio traen comas a menudo.
    expect(escapeCsvValue("SUPERMERCADO NACIONAL, S.A.")).toBe('"SUPERMERCADO NACIONAL, S.A."');
  });

  it("duplica las comillas de dentro", () => {
    expect(escapeCsvValue('Cafe "El Sitio"')).toBe('"Cafe ""El Sitio"""');
  });

  it("entrecomilla los saltos de línea (las notas las escribe el usuario)", () => {
    expect(escapeCsvValue("linea 1\nlinea 2")).toBe('"linea 1\nlinea 2"');
  });

  it("conserva los espacios de los extremos entrecomillando", () => {
    expect(escapeCsvValue("  con espacios  ")).toBe('"  con espacios  "');
  });

  it("null, undefined y vacío quedan como celda vacía", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
    expect(escapeCsvValue("")).toBe("");
  });
});

describe("transactionsToCsv", () => {
  it("empieza con BOM para que Excel no rompa los acentos", () => {
    // Sin BOM, Excel en Windows abre el CSV como ANSI y "Alimentación"
    // aparece como "AlimentaciÃ³n".
    expect(transactionsToCsv([])).toMatch(/^﻿/);
  });

  it("usa CRLF como fin de línea (RFC 4180)", () => {
    const csv = transactionsToCsv([tx()]);
    expect(csv.split("\r\n").length).toBeGreaterThan(2);
  });

  it("escribe la cabecera aunque no haya transacciones", () => {
    const csv = transactionsToCsv([]);
    expect(csv).toContain("Tipo,Comercio,Monto,Moneda");
  });

  it("traduce tipo y origen a algo legible", () => {
    const csv = transactionsToCsv([tx({ type: "income", source: "voice" })]);
    const fila = csv.split("\r\n")[1];
    expect(fila).toContain("Ingreso");
    expect(fila).toContain("Voz");
  });

  it("cae a la categoría sugerida por la IA si no hay una confirmada", () => {
    const csv = transactionsToCsv([tx({ category: null, ai_suggested_category: "Transporte" })]);
    expect(csv.split("\r\n")[1]).toContain("Transporte");
  });

  it("una coma en el comercio no desplaza las columnas", () => {
    const csv = transactionsToCsv([tx({ merchant: "NACIONAL, S.A." })]);
    const fila = csv.split("\r\n")[1];
    // La cabecera tiene 11 columnas; la fila debe tener las mismas.
    expect(contarColumnas(fila)).toBe(contarColumnas(csv.split("\r\n")[0]));
  });

  it("el monto sale siempre con dos decimales", () => {
    expect(transactionsToCsv([tx({ amount: 1000 })]).split("\r\n")[1]).toContain("1000.00");
  });

  it("una fila por transacción", () => {
    const csv = transactionsToCsv([tx({ id: "a" }), tx({ id: "b" }), tx({ id: "c" })]);
    // cabecera + 3 filas + el salto final
    expect(csv.trimEnd().split("\r\n")).toHaveLength(4);
  });
});

describe("formatCsvDate", () => {
  it("convierte a hora de RD, no deja el UTC crudo", () => {
    // 16:00 UTC son las 12:00 en RD (UTC-4). Dejar el ISO mostraría una hora
    // que el usuario nunca vivió, y Excel ni lo reconoce como fecha.
    expect(formatCsvDate("2026-09-01T16:00:00.000Z")).toBe("2026-09-01 12:00");
  });

  it("retrocede de día cuando toca", () => {
    // 02:00 UTC del día 2 son las 22:00 del día 1 en RD.
    expect(formatCsvDate("2026-09-02T02:00:00.000Z")).toBe("2026-09-01 22:00");
  });

  it("acepta el formato +00:00 que devuelve Supabase", () => {
    expect(formatCsvDate("2026-09-01T16:00:00+00:00")).toBe("2026-09-01 12:00");
  });

  it("una fecha inválida deja la celda vacía en vez de romper la exportación", () => {
    expect(formatCsvDate("no es una fecha")).toBe("");
  });
});

describe("csvFilename", () => {
  it("lleva la fecha con ceros a la izquierda", () => {
    expect(csvFilename(new Date(2026, 0, 5))).toBe("peso-transacciones-2026-01-05.csv");
  });
});

/** Cuenta columnas respetando las comillas (parser mínimo, solo para el test). */
function contarColumnas(linea: string): number {
  let columnas = 1;
  let dentroDeComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (dentroDeComillas && linea[i + 1] === '"') i++;
      else dentroDeComillas = !dentroDeComillas;
    } else if (c === "," && !dentroDeComillas) {
      columnas++;
    }
  }
  return columnas;
}
