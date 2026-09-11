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

  it("ignora la cancelación de una tarjeta", () => {
    // Avisa de que la tarjeta dejó de existir, no de un movimiento de dinero.
    expect(isIgnorablePopularEmail("Cancelacion tarjeta de débito")).toBe(true);
    expect(isIgnorablePopularEmail("Cancelación de tarjeta de crédito")).toBe(true);
  });

  it("no ignora un consumo", () => {
    expect(isIgnorablePopularEmail("Notificación de Consumo")).toBe(false);
  });
});

/**
 * Segunda tanda de formatos reales, del 2026-09-11 por la tarde: después del
 * primer arreglo seguían fallando SEIS cosas distintas, todas confirmadas
 * contra `GET /api/admin/failed-emails`. Cada `describe` de abajo es una.
 *
 * Nombres y últimos 4 dígitos ENMASCARADOS a mano: los correos son de otras
 * personas y el repo es público. La estructura —lo único que el parser
 * necesita— se conserva carácter por carácter, tabuladores incluidos.
 */

// El salto de línea del envoltorio se comió el TAB que separaba Comercio de
// Estatus: "KFC SAN PEDRO\nAprobada" en vez de "KFC SAN PEDRO\tAprobada".
const CONSUMO_TAB_COMIDO = `\r
Estimado (a) NOMBRE APELLIDO \r
\r
Gracias por utilizar su Tarjeta Debito Digital/QR, terminada en 3333. \r
\r
A continuación detalle de la transacción:\r
\r
\r
Monto \tMoneda \tFecha \tComercio \tEstatus \t\r
RD$230.00\t Peso dominicano\t 03/09/2026 \tKFC SAN PEDRO\r
Aprobada\t\r
\r
En caso de requerir mayor información, puede comunicarse con nosotros\r
llamando al 809-544-5555. \r
`;

// Consumo en DÓLARES: el monto llega como "US$11.99" y la columna Moneda dice
// "Dólar estadounidense".
const CONSUMO_USD = `\r
Estimado (a) NOMBRE APELLIDO \r
\r
Gracias por utilizar su Tarjeta Debito Digital/QR, terminada en 3333. \r
\r
A continuación detalle de la transacción:\r
\r
\r
Monto \tMoneda \tFecha \tComercio \tEstatus \t\r
US$11.99\t Dólar estadounidense\t 01/09/2026 \tSpotify\r
P465A50D35 \tAprobada\t\r
`;

// Transacción DECLINADA por fondos insuficientes: otra plantilla (sin columna
// Moneda) y con el mismo asunto que una aprobada.
const CONSUMO_DECLINADO = `\r
Estimado (a) NOMBRE APELLIDO \r
\r
Gracias por utilizar su Visa Débito Clásica, terminada en 3333.\r
\r
Le informamos que su transacción ha sido declinada por fondos\r
insuficientes.\r
\r
A continuación el detalle de su transacción:\r
\r
Monto\tFecha\t Comercio\t Estatus\t\r
RD$18,800.00\t07/09/2026\tBANCO POPULAR OFICINA DR.\r
Declinada\t\r
`;

// Asunto abreviado del mismo tipo que ya se soportaba: el banco lo manda como
// "transf recibida via app e IB" según el canal. Ojo al monto: "RD" sin "$".
const TRANSF_RECIBIDA_ABREVIADA = `<p>Le informamos los detalles de la transacción de transferencia recibida en su cuenta terminada en&nbsp;0000&nbsp;:</p><table class='myTable'><tbody><tr><th>Monto</th> <td>Fecha</td> <td>Canal</td></tr><tr><th>RD&nbsp;&nbsp;&nbsp;2,500.00&nbsp;</th> <td>14/8/2026&nbsp;&nbsp;<br></td>  <td>APP POPULAR&nbsp;&nbsp; &nbsp;</td>
</tr></tbody></table>`;

// Depósito hecho en sucursal: misma tabla que el depósito por ATM, asunto
// distinto (y por eso no se dispatchaba).
const DEPOSITO_SUCURSAL = `<p>Le informamos los detalles de la transacción de depósito efectuado en su cuenta terminada en 0000&nbsp;:</p><table class='myTable'><tbody><tr><th>Monto</th><td>Fecha</td><td>Canal</td></tr><tr><th>RD&nbsp;$1,400.00&nbsp;</th><td>2/9/2026&nbsp;</td><td>OFICINA ALMACENES IBERIA, SPM&nbsp;</td></tr></tbody></table>`;

describe("el salto de línea puede comerse un tabulador (2026-09-11)", () => {
  it("lee el consumo aunque el Estatus quede pegado al comercio", () => {
    expect(parsePopularEmail("Notificación de Consumo", CONSUMO_TAB_COMIDO)).toEqual({
      type: "expense",
      merchant: "KFC SAN PEDRO",
      amount: 230,
      currency: "DOP",
      date: new Date("2026-09-03T16:00:00.000Z"),
      card_last4: "3333",
      available_balance: null,
    });
  });

  it("y sigue uniendo un comercio partido en dos líneas", () => {
    // Los dos casos son el MISMO carácter (\n) significando cosas distintas.
    // Aquí el salto está dentro del valor y el tab de Estatus sí llegó.
    expect(parsePopularEmail("Notificación de Consumo", CONSUMO_USD)).toMatchObject({
      merchant: "Spotify P465A50D35",
    });
  });
});

describe("consumos en dólares", () => {
  it("lee el monto con prefijo US$ y lo marca como USD", () => {
    // Con la expresión anterior, que exigía "RD", el monto salía null y la
    // transacción se perdía ENTERA aunque el resto de la tabla estuviera bien.
    expect(parsePopularEmail("Notificación de Consumo", CONSUMO_USD)).toMatchObject({
      amount: 11.99,
      currency: "USD",
    });
  });
});

describe("transacciones declinadas", () => {
  it("no se parsean", () => {
    expect(parsePopularEmail("Notificación de Consumo", CONSUMO_DECLINADO)).toBeNull();
  });

  it("y se reconocen como ruido, no como parser roto", () => {
    // Sin esto, cada intento fallido de pagar disparaba una alerta de "banco
    // cambió el formato" y guardaba una muestra del correo. El dinero nunca se
    // movió: no hay nada que registrar ni nada que arreglar.
    expect(isIgnorablePopularEmail("Notificación de Consumo", CONSUMO_DECLINADO)).toBe(true);
  });

  it("pero un consumo aprobado NO es ignorable", () => {
    // La red que impide que "ignorar declinadas" se coma transacciones reales.
    expect(isIgnorablePopularEmail("Notificación de Consumo", CONSUMO_TAB_COMIDO)).toBe(false);
  });
});

describe("asuntos que el dispatcher no reconocía", () => {
  it('"transf recibida via app e IB" es el mismo ingreso, abreviado', () => {
    expect(
      parsePopularEmail("Notificación transf recibida via app e IB", TRANSF_RECIBIDA_ABREVIADA),
    ).toEqual({
      type: "income",
      merchant: "Transferencia recibida (APP POPULAR)",
      amount: 2500,
      currency: "DOP",
      date: new Date("2026-08-14T16:00:00.000Z"),
      card_last4: null,
      available_balance: null,
    });
  });

  it("un depósito recibido en sucursal es un ingreso", () => {
    expect(
      parsePopularEmail("Notificación de depósito recibido en sucursal", DEPOSITO_SUCURSAL),
    ).toEqual({
      type: "income",
      merchant: "Depósito OFICINA ALMACENES IBERIA, SPM",
      amount: 1400,
      currency: "DOP",
      date: new Date("2026-09-02T16:00:00.000Z"),
      card_last4: null,
      available_balance: null,
    });
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
