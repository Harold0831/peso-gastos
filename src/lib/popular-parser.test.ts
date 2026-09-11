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

/**
 * Formatos vistos en producción el 2026-09-11, sacados de
 * `GET /api/admin/failed-emails` — los tres fallaban.
 *
 * Nombres y últimos 4 dígitos ENMASCARADOS a mano: estos correos son de otra
 * persona y el repo es público. La estructura, que es lo único que el parser
 * necesita, se conserva carácter por carácter.
 */

// Mismo tipo que ya existía, pero el cuerpo llega como TEXTO PLANO con las
// etiquetas separadas por TABULADORES en una sola línea (antes venía una
// etiqueta por línea). Ojo al comercio: se parte en dos líneas.
const CONSUMO_TABS = `\r
Estimado (a) NOMBRE APELLIDO \r
\r
Gracias por utilizar su Tarjeta Debito Digital/QR, terminada en 1111. \r
\r
A continuación detalle de la transacción:\r
\r
\r
Monto \tMoneda \tFecha \tComercio \tEstatus \t\r
RD$643.10\t Peso dominicano\t 04/09/2026 \tSTARBUCKS\r
CUMAYASA \tAprobada\t\r
\r
En caso de requerir mayor información, puede comunicarse con nosotros\r
llamando al 809-544-5555. \r
`;

const RETIRO_TABS = `\r
Estimado (a) NOMBRE APELLIDO \r
\r
Gracias por utilizar su Tarjeta Visa Débito Clásica, terminada en 2222. \r
\r
A continuación detalle de la transacción:\r
\r
\r
Monto \tMoneda \tFecha \tCajero Automatico\t Estatus \t\r
RD$200.00 \tPeso dominicano \t05/09/2026 \tBANCO POPULAR\r
OF. C. NACI \tAprobada\t\r
`;

// Tipo NUEVO: no estaba en el parser. Llega como HTML.
const TRANSFERENCIA_RECIBIDA_HTML = `<table><tbody><tr><td><p><b>Estimado&nbsp;APELLIDO NOMBRE&nbsp;</b></p><p>Le informamos los detalles de la transacción de transferencia recibida en su cuenta terminada en 0000:</p></td></tr><tr><td><table class='myTable'><tbody><tr><th>Monto</th>
<td>Fecha</td>
<td>Canal</td>
</tr><tr><th>RD&nbsp;$650.00&nbsp;</th>
<td>4/9/2026&nbsp;<br></td>
<td>APP POPULAR&nbsp;<br></td>
</tr></tbody></table><p>Si necesita más información o no reconoce esta transacción, no dude en contactarnos llamando al 809-544-5555.</p></td></tr></tbody></table>`;

describe("formatos de tabla separados por tabuladores (2026-09)", () => {
  it("lee un consumo aunque las etiquetas vengan en una sola línea con tabs", () => {
    const result = parsePopularEmail("Notificación de Consumo", CONSUMO_TABS);
    expect(result).toEqual({
      type: "expense",
      // El comercio venía partido en dos líneas: "STARBUCKS" + "CUMAYASA".
      // Unirlo es justo lo que distingue leerlo bien de leer "STARBUCKS".
      merchant: "STARBUCKS CUMAYASA",
      amount: 643.1,
      currency: "DOP",
      date: new Date("2026-09-04T16:00:00.000Z"), // mediodía AST
      card_last4: "1111",
      available_balance: null,
    });
  });

  it("lee un retiro con el mismo formato", () => {
    const result = parsePopularEmail("Notificación de Retiro", RETIRO_TABS);
    expect(result).toMatchObject({
      type: "expense",
      merchant: "Retiro cajero BANCO POPULAR OF. C. NACI",
      amount: 200,
      currency: "DOP",
      card_last4: "2222",
    });
    expect(result?.date).toEqual(new Date("2026-09-05T16:00:00.000Z"));
  });

  it("sigue leyendo el formato viejo, de una etiqueta por línea", () => {
    // El banco manda los dos; soportar el nuevo no puede romper el anterior.
    expect(parsePopularEmail("Notificación de Consumo", CONSUMO_TEXT)).toMatchObject({
      merchant: "MAYOL & CO GAS",
      amount: 1500,
    });
  });
});

describe("transferencia recibida por canal digital", () => {
  it("es un INGRESO, no un gasto", () => {
    const result = parsePopularEmail(
      "Notificación transferencia recibida por canal digital",
      TRANSFERENCIA_RECIBIDA_HTML,
    );
    expect(result).toEqual({
      type: "income",
      merchant: "Transferencia recibida (APP POPULAR)",
      amount: 650,
      currency: "DOP",
      date: new Date("2026-09-04T16:00:00.000Z"),
      // "cuenta terminada en 0000" es una CUENTA, no una tarjeta: si se
      // guardara en card_last4 aparecería como una tarjeta fantasma en
      // /cards y agruparía transferencias bajo ella.
      card_last4: null,
      available_balance: null,
    });
  });
});
