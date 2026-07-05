import { describe, expect, it } from "vitest";
import { parseCaribeDateTime, parseCaribeEmail } from "./caribe-parser";

// Fixture del único correo real de Banco Caribe disponible (2026-07-05,
// compartido por un amigo de Harold): compra con tarjeta de crédito en USD.

const CARD_TRANSACTION_TEXT = `
Estimado (a) cliente:
Te informamos que tu Tarjeta de Crédito Caribe terminada 2050 posee una transacción en:
Comercio: AMAZON RETAIL +14018657948 US
Monto: 169.00
Moneda: USD
Fecha: 24 / 06 / 2026
Hora: 12 : 25 : 56
Saldo disponible: 28.87
En caso de no reconocer esta transacción, favor comunicarte con nuestro Centro de Contacto.
`;

describe("parseCaribeDateTime", () => {
  it("parsea fecha y hora con espacios alrededor de separadores (AST → UTC)", () => {
    const date = parseCaribeDateTime("24 / 06 / 2026", "12 : 25 : 56");
    expect(date?.toISOString()).toBe("2026-06-24T16:25:00.000Z");
  });

  it("usa mediodía si no hay hora", () => {
    const date = parseCaribeDateTime("24 / 06 / 2026", null);
    expect(date?.toISOString()).toBe("2026-06-24T16:00:00.000Z");
  });

  it("devuelve null con formato inválido", () => {
    expect(parseCaribeDateTime("junio 24", null)).toBeNull();
  });
});

describe("parseCaribeEmail", () => {
  it("parsea una transacción de tarjeta como gasto en USD", () => {
    const result = parseCaribeEmail("BANCO CARIBE", CARD_TRANSACTION_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("AMAZON RETAIL +14018657948 US");
    expect(result!.amount).toBe(169);
    expect(result!.currency).toBe("USD");
    expect(result!.card_last4).toBe("2050");
    expect(result!.available_balance).toBe(28.87);
    expect(result!.date.toISOString()).toBe("2026-06-24T16:25:00.000Z");
  });

  it("devuelve null si el cuerpo no es una transacción", () => {
    expect(parseCaribeEmail("BANCO CARIBE", "Su estado de cuenta está disponible.")).toBeNull();
  });
});
