import { describe, expect, it } from "vitest";
import { isIgnorableBhdEmail, parseBhdDate, parseBhdEmail } from "./bhd-parser";

// Fixtures de correos reales de Alertas@bhd.com.do (2026-07-05,
// compartidos por un amigo de Harold).

const CARD_TRANSACTION = `
BHD Notificación de Transacciones
Visa Mi País # 9639
Detalle de Criterios
Te notificamos la transacción realizada con tu Tarjeta Visa Mi País # 9639
En caso de no reconocer esta transacción, por favor llama de inmediato al 809-243-5282.
Detalle de Transacciones
Fecha
Moneda
Monto
Comercio
Estado
Tipo
04/07/2026 05:57 pm
RD
$483.80
FAM SKY LOUNGE & RESTAURA
Aprobada
Compra
Ahora, tus Tarjetas BHD cuentan con un nuevo sistema de seguridad.
`;

const TRANSFER = `
Estimado(a): ROBERT ERNESTO HUNT
A continuación la información relacionada a tu transacción:
Producto origen:
DO15BCBH000000000XXXXXXX0010
Producto destino:
DO54BRRD0000000000XXXXXX3860
Descripción:
Distortion
Monto:
RD$ 2,300.00
Beneficiario:
JOSHUEL RIJO FOSTER
Número de confirmación:
M11-1783-2091-7167-2
Fecha y hora de la transacción:
04/07/2026 - 7:52 PM
Tipo de transacción:
Transacciones entre productos BHD y a otros Bancos
`;

describe("parseBhdDate", () => {
  it("parsea fecha con hora pm (AST → UTC)", () => {
    expect(parseBhdDate("04/07/2026 05:57 pm")?.toISOString()).toBe("2026-07-04T21:57:00.000Z");
  });

  it("parsea fecha con guion y hora PM", () => {
    expect(parseBhdDate("04/07/2026 - 7:52 PM")?.toISOString()).toBe("2026-07-04T23:52:00.000Z");
  });

  it("usa mediodía sin hora", () => {
    expect(parseBhdDate("04/07/2026")?.toISOString()).toBe("2026-07-04T16:00:00.000Z");
  });
});

describe("parseBhdEmail", () => {
  it("parsea una transacción de tarjeta como gasto", () => {
    const result = parseBhdEmail("BHD Notificación de Transacciones", CARD_TRANSACTION);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("FAM SKY LOUNGE & RESTAURA");
    expect(result!.amount).toBe(483.8);
    expect(result!.currency).toBe("DOP");
    expect(result!.card_last4).toBe("9639");
    expect(result!.date.toISOString()).toBe("2026-07-04T21:57:00.000Z");
  });

  it("rechaza una transacción de tarjeta no aprobada", () => {
    const declined = CARD_TRANSACTION.replace("Aprobada", "Declinada");
    expect(parseBhdEmail("BHD Notificación de Transacciones", declined)).toBeNull();
  });

  it("parsea una transferencia a otros bancos como gasto", () => {
    const result = parseBhdEmail("Transacciones entre productos BHD y a otros Bancos", TRANSFER);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("JOSHUEL RIJO FOSTER");
    expect(result!.amount).toBe(2300);
    expect(result!.date.toISOString()).toBe("2026-07-04T23:52:00.000Z");
  });

  it("acepta la variante del asunto sin espacio ('BHD ya otros Bancos')", () => {
    const result = parseBhdEmail("Transacciones entre productos BHD ya otros Bancos", TRANSFER);
    expect(result).not.toBeNull();
  });

  it("devuelve null con asuntos desconocidos", () => {
    expect(parseBhdEmail("Estado de cuenta", "cualquier cosa")).toBeNull();
  });
});

describe("isIgnorableBhdEmail", () => {
  it("ignora 'Pagos al Instante en Proceso' (estado intermedio, duplicaría)", () => {
    expect(isIgnorableBhdEmail("Notificación Pagos al Instante en Proceso")).toBe(true);
  });
});
