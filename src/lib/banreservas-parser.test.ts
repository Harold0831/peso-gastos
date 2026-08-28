import { describe, expect, it } from "vitest";
import { parseBanreservasDate, parseBanreservasEmail } from "./banreservas-parser";

// Fixtures de correos reales de Banreservas (2026-08-03, reenviados por un
// amigo de Harold — texto exacto, solo se enmascaran cuentas/nombres si
// hiciera falta, que no fue el caso aquí).

const RECIBO_TRANSFERENCIA = `
¡Transacción realizada!
Te notificamos que la siguiente transacción fue realizada desde tu App
Banreservas:
Monto:
DOP 5,000.00
#concept#
Transacción:
Transferencia a Tercero
Origen:
OLIVER MEJIA PEGUERO, Cuenta corriente DOP ** - 7066
Destino:
SRA HENCY L MARTINEZ, Cuenta de ahorro DOP ** - 1681
Fecha de transacción:
15 de Julio 2026 - 11:37 AM
Impuestos:
DOP 10.00
Número de transacción:
242463686036
`;

const TRANSFERENCIA_RECIBIDA = `
[image: Success]
Transferencia Recibida
Te notificamos que la siguiente transferencia fue recibida:
Monto:
RD$ 8,000.00
Transacción:
Pago al instante BCRD
Origen:
L ROMANA CH REAL ESTATE SRL
Banco Origen:
BANCO POPULAR DOMINICANO, C. POR A.
Destino:
Cuenta Corriente •••• 7066
Fecha:
17/07/2026 08:48 AM
Recibido por los valores indicados en este comprobante.
`;

const CONSUMO_TARJETA = `
[image: Success]
Notificación de Consumo
Su tarjeta ESTANDAR ••0016 presenta un consumo.
Monto:
DOP 20.00
Estado:
APROBADO
Comercio:
PedidosYa(Propina Santo Domingo DO
Fecha de transacción:
30/07/2026 12:25 PM
Número de aprobación:
639117
Recibido por los valores indicados en este comprobante.
`;

// Mismo tipo de correo ("Notificación de Consumo") que un retiro de cajero
// — y trae el bug real del banco: fecha en 24h con sufijo "PM" pegado.
const RETIRO_CAJERO = `
[image: Success]
Notificación de Consumo
Su tarjeta ESTANDAR ••0016 presenta un retiro de cajero automatico.
Monto:
DOP 700.00
Estado:
APROBADO
Comercio:
BANCO RESERVAS R.D 010REP STDOM DR DO
Fecha de transacción:
31/07/2026 17:32 PM
Número de aprobación:
343229
Recibido por los valores indicados en este comprobante.
`;

describe("parseBanreservasEmail", () => {
  it("parsea el recibo de una transferencia enviada desde la App como gasto", () => {
    const result = parseBanreservasEmail("Recibo de la transacción", RECIBO_TRANSFERENCIA);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("SRA HENCY L MARTINEZ");
    expect(result!.amount).toBe(5000);
    expect(result!.currency).toBe("DOP");
    expect(result!.card_last4).toBeNull();
    expect(result!.date.toISOString()).toBe("2026-07-15T15:37:00.000Z");
  });

  it("parsea una transferencia recibida como ingreso", () => {
    const result = parseBanreservasEmail("Notificaciones Banreservas", TRANSFERENCIA_RECIBIDA);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("income");
    expect(result!.merchant).toBe("L ROMANA CH REAL ESTATE SRL");
    expect(result!.amount).toBe(8000);
    expect(result!.date.toISOString()).toBe("2026-07-17T12:48:00.000Z");
  });

  it("parsea un consumo con tarjeta aprobado como gasto, con los últimos 4", () => {
    const result = parseBanreservasEmail("Notificaciones Banreservas", CONSUMO_TARJETA);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("PedidosYa(Propina Santo Domingo DO");
    expect(result!.amount).toBe(20);
    expect(result!.card_last4).toBe("0016");
    expect(result!.date.toISOString()).toBe("2026-07-30T16:25:00.000Z");
  });

  it("rechaza un consumo no aprobado", () => {
    const declined = CONSUMO_TARJETA.replace("APROBADO", "DECLINADO");
    expect(parseBanreservasEmail("Notificaciones Banreservas", declined)).toBeNull();
  });

  it("parsea un retiro de cajero (misma plantilla que un consumo) y arregla la fecha 24h+PM", () => {
    const result = parseBanreservasEmail("Notificaciones Banreservas", RETIRO_CAJERO);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("BANCO RESERVAS R.D 010REP STDOM DR DO");
    expect(result!.amount).toBe(700);
    expect(result!.card_last4).toBe("0016");
    // "17:32 PM" es un bug del banco (24h + sufijo PM pegado): se toma la
    // hora tal cual (17) en vez de aplicar la lógica de 12h.
    expect(result!.date.toISOString()).toBe("2026-07-31T21:32:00.000Z");
  });

  it("devuelve null con asuntos desconocidos", () => {
    expect(parseBanreservasEmail("Estado de cuenta", "cualquier cosa")).toBeNull();
  });

  it("devuelve null si 'Notificaciones Banreservas' no trae un cuerpo reconocido", () => {
    expect(parseBanreservasEmail("Notificaciones Banreservas", "algo distinto")).toBeNull();
  });
});

describe("parseBanreservasDate", () => {
  it("parsea fecha en español con hora", () => {
    const date = parseBanreservasDate("15 de Julio 2026 - 11:37 AM");
    expect(date?.toISOString()).toBe("2026-07-15T15:37:00.000Z");
  });

  it("parsea fecha numérica normal (12h correcto)", () => {
    const date = parseBanreservasDate("17/07/2026 08:48 AM");
    expect(date?.toISOString()).toBe("2026-07-17T12:48:00.000Z");
  });

  it("trata una hora > 12 como 24h, ignorando el sufijo am/pm (bug del banco)", () => {
    const date = parseBanreservasDate("31/07/2026 17:32 PM");
    expect(date?.toISOString()).toBe("2026-07-31T21:32:00.000Z");
  });

  it("devuelve null con texto sin fecha reconocible", () => {
    expect(parseBanreservasDate("sin fecha aquí")).toBeNull();
  });
});
