import { describe, expect, it } from "vitest";
import {
  isIgnorablePopularEmail,
  parsePopularAmount,
  parsePopularDate,
  parsePopularEmail,
} from "./popular-parser";

// Fixtures tomados de correos reales de notificaciones@popularenlinea.com
// (2026-07-05). Estructura columnar: etiquetas primero, valores después.

const CONSUMO_TEXT = `
Estimado (a) HAROLD JIMENEZ CASTR
Gracias por utilizar su Tarjeta VISA DEBITO CLASICA, terminada en 4808.
A continuación detalle de la transacción:
Monto
Moneda
Fecha
Comercio
Estatus
RD$1,500.00
Peso dominicano
20/12/2025
MAYOL & CO GAS
Aprobada
En caso de requerir mayor información, puede comunicarse con nosotros.
`;

const RETIRO_TEXT = `
Estimado (a) HAROLD JIMENEZ CASTR
Gracias por utilizar su Tarjeta VISA DEBITO CLASICA, terminada en 4808.
A continuación detalle de la transacción:
Monto
Moneda
Fecha
Cajero Automatico
Estatus
RD$2,200.00
Peso dominicano
21/02/2025
JUMBO HIGUEY
Aprobada
`;

const CODIGO_CASH_TEXT = `
Estimado (a) JIMENEZ CASTRO HAR
Le informamos que el Código Cash generado desde tu aplicación móvil, ha sido utilizado en uno de nuestros cajeros automáticos.
A continuación te damos el detalle de la transacción: Monto
Fecha
Estatus
RD $4,000.00
15/01/2026
Aprobada
`;

const DEPOSITO_TEXT = `
Estimado (a) JIMENEZ CASTRO HAR
A continuación, le informamos el detalle del depósito recibido en su cuenta terminada en 7379 .
Monto
Fecha
Canal
RD 12,400.00
20260704
OFICINA_LA_ROMANA_DC LA L
`;

const PAGO_INSTANTE_TEXT = `
Estimado (a) SR HAROLD G JIMENEZ CASTRO
Le informamos que su transacción por pagos al instante fue enviada satisfactoriamente.
A continuación, el detalle de su transacción:
Beneficiario: HAROLD GABRIEL JIMENEZ CASTR
Cuenta o Producto:******_8073
Monto: RD$ 24,988.00
Fecha: 2/1/2026
Favor comunicarse con el banco destino para confirmar la recepción.
`;

const REVERSO_TEXT = `
Estimado (a) JIMENEZ CASTRO HAR .
Nos place informarle que hemos procedido con la devolución de RD 2.32 correspondiente al cargo por sobregiro aplicado a su cuenta No 7379 en fecha 26/5/26 .
`;

describe("parsePopularAmount", () => {
  it("parsea RD$ pegado", () => {
    expect(parsePopularAmount("RD$1,500.00")).toBe(1500);
  });

  it("parsea RD $ con espacio", () => {
    expect(parsePopularAmount("RD $4,000.00")).toBe(4000);
  });

  it("parsea RD sin símbolo de dólar", () => {
    expect(parsePopularAmount("RD 12,400.00")).toBe(12400);
  });

  it("parsea RD$ con espacio después", () => {
    expect(parsePopularAmount("RD$ 24,988.00")).toBe(24988);
  });
});

describe("parsePopularDate", () => {
  it("parsea DD/MM/YYYY como mediodía AST", () => {
    expect(parsePopularDate("20/12/2025")?.toISOString()).toBe("2025-12-20T16:00:00.000Z");
  });

  it("parsea D/M/YYYY", () => {
    expect(parsePopularDate("2/1/2026")?.toISOString()).toBe("2026-01-02T16:00:00.000Z");
  });

  it("parsea D/M/YY (reverso por sobregiro)", () => {
    expect(parsePopularDate("26/5/26")?.toISOString()).toBe("2026-05-26T16:00:00.000Z");
  });

  it("parsea YYYYMMDD (depósito por ATM)", () => {
    expect(parsePopularDate("20260704")?.toISOString()).toBe("2026-07-04T16:00:00.000Z");
  });

  it("devuelve null con basura", () => {
    expect(parsePopularDate("ayer")).toBeNull();
  });
});

describe("parsePopularEmail", () => {
  it("parsea una notificación de consumo como gasto", () => {
    const result = parsePopularEmail("Notificación de Consumo", CONSUMO_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("MAYOL & CO GAS");
    expect(result!.amount).toBe(1500);
    expect(result!.currency).toBe("DOP");
    expect(result!.card_last4).toBe("4808");
    expect(result!.date.toISOString()).toBe("2025-12-20T16:00:00.000Z");
  });

  it("parsea un retiro de cajero como gasto", () => {
    const result = parsePopularEmail("Notificación de Retiro", RETIRO_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("Retiro cajero JUMBO HIGUEY");
    expect(result!.amount).toBe(2200);
  });

  it("parsea un retiro con Código Cash como gasto", () => {
    const result = parsePopularEmail("Notificación de retiro Código Cash", CODIGO_CASH_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("Retiro Código Cash");
    expect(result!.amount).toBe(4000);
    expect(result!.date.toISOString()).toBe("2026-01-15T16:00:00.000Z");
  });

  it("parsea un depósito por ATM como ingreso", () => {
    const result = parsePopularEmail("Depósito por ATM", DEPOSITO_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("income");
    expect(result!.merchant).toBe("Depósito OFICINA_LA_ROMANA_DC LA L");
    expect(result!.amount).toBe(12400);
    expect(result!.date.toISOString()).toBe("2026-07-04T16:00:00.000Z");
  });

  it("parsea un pago al instante enviado como gasto", () => {
    const result = parsePopularEmail(
      "Notificaciones Pagos al Instante transferencia enviada",
      PAGO_INSTANTE_TEXT,
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("HAROLD GABRIEL JIMENEZ CASTR");
    expect(result!.amount).toBe(24988);
    expect(result!.date.toISOString()).toBe("2026-01-02T16:00:00.000Z");
  });

  it("parsea un reverso por sobregiro como ingreso", () => {
    const result = parsePopularEmail("Notificacion Reverso a cuenta por sobregiro", REVERSO_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("income");
    expect(result!.merchant).toBe("Reverso por sobregiro");
    expect(result!.amount).toBe(2.32);
    expect(result!.date.toISOString()).toBe("2026-05-26T16:00:00.000Z");
  });

  it("rechaza un consumo con estatus distinto de Aprobada", () => {
    const declined = CONSUMO_TEXT.replace("Aprobada", "Declinada");
    expect(parsePopularEmail("Notificación de Consumo", declined)).toBeNull();
  });

  it("devuelve null con un asunto desconocido", () => {
    expect(parsePopularEmail("Notificación cambio en su perfil", "cualquier cosa")).toBeNull();
  });
});

describe("isIgnorablePopularEmail", () => {
  it("ignora actualización de límite", () => {
    expect(isIgnorablePopularEmail("Actualización de Límite")).toBe(true);
  });

  it("ignora tarjeta bloqueada", () => {
    expect(isIgnorablePopularEmail("Notificación de Tarjeta bloqueada por seguridad")).toBe(true);
  });

  it("no ignora un consumo", () => {
    expect(isIgnorablePopularEmail("Notificación de Consumo")).toBe(false);
  });
});
