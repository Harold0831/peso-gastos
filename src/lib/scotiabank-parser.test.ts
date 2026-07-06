import { describe, expect, it } from "vitest";
import { parseScotiabankEmail } from "./scotiabank-parser";

// Fixtures de correos reales de alertas@scotiabank.com (2026-07-05,
// compartidos por un amigo de Harold). Prosa sin tabla; la fecha NO viene
// en el cuerpo (solo la hora) — se toma de receivedAt.

const RECEIVED = new Date("2026-06-30T08:32:00.000Z"); // 04:32 AST

const PAGO_INSTANTE = `
Estimado cliente,
Hemos recibido y procesado su solicitud de Pago al Instante en línea desde su cuenta ***9430 con el siguiente detalle:
•
Cuenta destino: ***7667
•
Banco: QIK BANCO DIGITAL DOMINICANO S
•
Monto: $18,000.00 DOP
•
Número de Referencia: E000073.A31420
•
Descripción:
Si no reconoce esta operación, llámenos al (809) 567-7268.
`;

const PAGO_FACTURA = `
Hola FRANCISCO S,
Se realizó un pago de factura por una cantidad de $1,757.49 a Altice desde la cuenta ***9430 a las 07:19 am AST.
Si usted no lo hizo, por favor llame al número que aparece en la parte de atrás de su tarjeta.
`;

const RETIRO = `
Hola FRANCISCO S,
Su tarjeta de débito Scotiabank ha sido utilizada para un retiro de efectivo en cajero automático en la cuenta ***9430 por un monto de $400.00 a las 07:29 am AST.
`;

const COMPRA_FUERA = `
Hola FRANCISCO S,
Se realizó una compra fuera del país por un monto de $1.99 en GOOGLE *Google One con su tarjeta de débito Scotiabank a las 06:40 am AST. Tenga en cuenta que el monto de la compra está en la moneda de la cuenta.
`;

const TRANSFERENCIA = `
Hola FRANCISCO S,
Se realizó una transferencia por una cantidad de $7,500.00 desde la cuenta ***9430 a las 04:30 am AST.
`;

describe("parseScotiabankEmail", () => {
  it("parsea un pago al instante como gasto (con banco destino)", () => {
    const result = parseScotiabankEmail("Pago al Instante realizado", PAGO_INSTANTE, RECEIVED);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("Pago al Instante · QIK BANCO DIGITAL DOMINICANO S");
    expect(result!.amount).toBe(18000);
    // sin "a las HH:MM" en el cuerpo → usa receivedAt tal cual
    expect(result!.date.toISOString()).toBe("2026-06-30T08:32:00.000Z");
  });

  it("parsea un pago de factura extrayendo el comercio", () => {
    const result = parseScotiabankEmail("Pago de factura realizado", PAGO_FACTURA, RECEIVED);
    expect(result).not.toBeNull();
    expect(result!.merchant).toBe("Altice");
    expect(result!.amount).toBe(1757.49);
    // hora del cuerpo (07:19 am AST) + día de receivedAt (30 jun AST)
    expect(result!.date.toISOString()).toBe("2026-06-30T11:19:00.000Z");
  });

  it("parsea un retiro de cajero", () => {
    const result = parseScotiabankEmail("Retiro de cajero automático", RETIRO, RECEIVED);
    expect(result).not.toBeNull();
    expect(result!.merchant).toBe("Retiro en cajero");
    expect(result!.amount).toBe(400);
  });

  it("parsea una compra fuera del país extrayendo el comercio", () => {
    const result = parseScotiabankEmail("Compra fuera del país", COMPRA_FUERA, RECEIVED);
    expect(result).not.toBeNull();
    expect(result!.merchant).toBe("GOOGLE *Google One");
    expect(result!.amount).toBe(1.99);
  });

  it("parsea una transferencia a terceros", () => {
    const result = parseScotiabankEmail("Transferencias a terceros", TRANSFERENCIA, RECEIVED);
    expect(result).not.toBeNull();
    expect(result!.merchant).toBe("Transferencia a terceros");
    expect(result!.amount).toBe(7500);
  });

  it("devuelve null con un asunto desconocido (alertas de login, etc.)", () => {
    expect(parseScotiabankEmail("Inicio de sesión detectado", "Hola...", RECEIVED)).toBeNull();
  });
});
