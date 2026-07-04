import { describe, expect, it } from "vitest";
import {
  htmlToText,
  isIgnorableQikEmail,
  parseAmount,
  parseQikDate,
  parseQikEmail,
} from "./qik-parser";

// Fixtures tomados de correos reales de no-reply-qik@qik.com.do (con
// nombre/cédula ya enmascarados por el propio Qik). Recortados a lo
// esencial de cada plantilla — ver CLAUDE.md § Parser de correos Qik.

const SERVICE_PAYMENT_HTML = `
<html><body>
<h1>¡Hola&nbsp;Harold!</h1>
<p>Cédula &nbsp;***-****514-7</p>
<p>Realizaste el siguiente pago de servicio:</p>
<div>
  <p>Monto total pagado</p>
  <h1>RD$ 1,238.43</h1>
</div>
<div class="cardDescrition">
  <div><p>Fecha y hora</p></div>
  <div><p>02 julio 2026 / 10:57 a. m.</p></div>
</div>
<div class="cardDescrition">
  <div><p>Servicio</p></div>
  <div>
    <p>Electricidad / Edeeste</p>
    <p>NIC: <b>2251828</b></p>
  </div>
</div>
<div class="cardDescrition">
  <div><p>Canal</p></div>
  <div><p>Pago de servicio</p></div>
</div>
<div class="cardDescrition">
  <div><p>Forma de pago</p></div>
  <div><p>Visa *3326</p></div>
</div>
<div class="cardDescritionul">
  <div><p>N° referencia</p></div>
  <div><p>198-180633919</p></div>
</div>
</body></html>
`;

const TOKE_RECEIVED_HTML = `
<html><body>
<h1>¡Hola, Harold!</h1>
<p class="textBody">
  Has recibido <b>RD$ 19,174.00</b> por parte de <b>Harold G Jimenez Castro</b> en tu Cuenta en pesos *8073.
</p>
<table>
  <tr><td>Fecha</td><td>30 de jun. 2026</td></tr>
  <tr><td>Realizado por</td><td>Harold G Jimenez Castro</td></tr>
  <tr><td>Monto</td><td>RD$ 19,174.00</td></tr>
  <tr><td>Método de envío</td><td>Toke</td></tr>
  <tr><td>Comentario</td><td></td></tr>
</table>
</body></html>
`;

const CASH_WITHDRAWAL_HTML = `
<html><body>
<h1>¡Hola,&nbsp;Harold!</h1>
<p>Cédula &nbsp;***-****514-7</p>
<p>El Código CASH generado desde tu App Qik ha sido utilizado con éxito.</p>
<div class="card">
  <div class="row"><p>Monto</p><p>RD$ 4,000.00</p></div>
  <div class="row"><p>Estatus</p><p>Exitoso</p></div>
  <div class="row"><p>Fecha</p><p>18 de jun 2026</p></div>
</div>
</body></html>
`;

const CARD_PURCHASE_HTML = `
<html><body>
<p><strong>¡Hola&nbsp;HAROLD GABRIEL JIMENEZ CASTRO!</strong></p>
<p>Tarjeta D&eacute;bito 49*************3326</p>
<p>Se hizo una transacci&oacute;n de RD$ 674.99 en <strong>WENDYS SAMBIL</strong> con tu Tarjeta de D&eacute;bito Qik que termina en <strong>49*************3326</strong></p>
<table>
  <tr><td>Localidad</td><td><strong>WENDYS SAMBIL</strong></td></tr>
  <tr><td>Fecha y hora</td><td><strong>07-04-2026 01:11 PM (AST)</strong></td></tr>
  <tr><td>Monto</td><td><b>RD$ 674.99</b></td></tr>
  <tr><td>Balance Disponible</td><td><strong>RD$ 12,531.31</strong></td></tr>
</table>
</body></html>
`;

// Plantilla vieja (2025) de compra con tarjeta: campos "Lugar"/"Estatus",
// monto sin prefijo "RD", sin "Balance Disponible".
const CARD_PURCHASE_OLD_TEMPLATE_HTML = `
<html><body>
<p>&iexcl;Hola, HAROLD GABRIEL!</p>
<p>Tarjeta d&eacute;bito 49*************3326</p>
<p>Se hizo una transacci&oacute;n de RD$ 124.76 en <strong>GOOGLE *Google One</strong> con tu Tarjeta de D&eacute;bito Qik Visa que termina en *3326 .</p>
<table>
  <tr><td>Estatus</td><td><strong>Aprobada</strong></td></tr>
  <tr><td>Fecha y hora</td><td><strong>07-22-2025 11:41 AM (AST)</strong></td></tr>
  <tr><td>Monto</td><td><b>RD$ 124.76</b></td></tr>
  <tr><td>Lugar</td><td><strong>GOOGLE *Google One</strong></td></tr>
</table>
</body></html>
`;

const CARD_PURCHASE_DECLINED_HTML = `
<html><body>
<p>&iexcl;Hola, HAROLD GABRIEL!</p>
<p>Tarjeta d&eacute;bito 49*************3326</p>
<p>Se intent&oacute; realizar una compra de $ 1.00 en <strong>CANVA* PAAAAGZ6WTPVHWY</strong> con tu Tarjeta de D&eacute;bito Qik Visa que termina en *3326 .</p>
<table>
  <tr><td>Estatus</td><td><strong>Declinado</strong></td></tr>
  <tr><td>Motivo</td><td><strong>CVV no v&aacute;lido</strong></td></tr>
  <tr><td>Fecha y hora</td><td><strong>09-24-2025 03:36 PM (AST)</strong></td></tr>
  <tr><td>Monto</td><td><b>$ 1.00</b></td></tr>
  <tr><td>Lugar</td><td><strong>CANVA* PAAAAGZ6WTPVHWY</strong></td></tr>
</table>
</body></html>
`;

const CARD_REVERSAL_HTML = `
<html><body>
<p>&iexcl;Hola, HAROLD GABRIEL!</p>
<p>Tarjeta D&eacute;bito 49*************3326</p>
<p>Ha sido reversada la transacci&oacute;n de $ 20.00 en <strong>VERCEL INC.</strong> con tu Tarjeta de D&eacute;bito Qik que termina en *3326. Los fondos ya est&aacute;n disponibles en tu cuenta.</p>
<table>
  <tr><td>Estatus</td><td><strong>Reversada</strong></td></tr>
  <tr><td>Fecha y hora</td><td><strong>05-27-2026 10:21 AM (AST)</strong></td></tr>
  <tr><td>Monto</td><td><b>$ 20.00</b></td></tr>
  <tr><td>Lugar</td><td><strong>VERCEL INC.</strong></td></tr>
</table>
</body></html>
`;

const OTP_HTML = `
<html><body>
<p>&iexcl;Hola HAROLD GABRIEL!</p>
<p>Tarjeta ***-***3326</p>
<p>Tu c&oacute;digo es:</p>
<p>737859</p>
<p>Debes colocar este c&oacute;digo para validar tu transacci&oacute;n.</p>
</body></html>
`;

const CASH_CODE_CREATED_HTML = `
<html><body>
<h1>¡Hola,&nbsp;Harold!</h1>
<p>Cédula &nbsp;***-****514-7</p>
<p>El Código CASH para ti ha sido creado con éxito. Puedes visualizarlo desde tu App Qik.</p>
<div class="card">
  <div class="row"><p>Monto</p><p>RD$ 4,000.00</p></div>
  <div class="row"><p>Fecha de creación:</p><p>18 de jun 2026</p></div>
  <div class="row"><p>Vigencia</p><p>2 horas</p></div>
</div>
</body></html>
`;

describe("parseAmount", () => {
  it("parsea montos con miles y decimales", () => {
    expect(parseAmount("RD$ 2,840.50")).toBe(2840.5);
  });

  it("parsea montos sin coma", () => {
    expect(parseAmount("RD$ 385.00")).toBe(385);
  });

  it("parsea montos sin el prefijo RD (plantilla vieja de compras)", () => {
    expect(parseAmount("$ 20.00")).toBe(20);
  });

  it("devuelve null si no hay monto", () => {
    expect(parseAmount("sin monto aquí")).toBeNull();
  });
});

describe("parseQikDate", () => {
  it("parsea fecha con hora y mes completo (AST → UTC)", () => {
    const date = parseQikDate("02 julio 2026 / 10:57 a. m.");
    expect(date?.toISOString()).toBe("2026-07-02T14:57:00.000Z");
  });

  it("parsea fecha con hora p.m.", () => {
    const date = parseQikDate("02 julio 2026 / 3:15 p. m.");
    expect(date?.toISOString()).toBe("2026-07-02T19:15:00.000Z");
  });

  it("parsea fecha sin hora, mes abreviado con 'de'", () => {
    const date = parseQikDate("18 de jun 2026");
    expect(date?.toISOString()).toBe("2026-06-18T16:00:00.000Z");
  });

  it("parsea fecha sin hora, mes abreviado con punto", () => {
    const date = parseQikDate("30 de jun. 2026");
    expect(date?.toISOString()).toBe("2026-06-30T16:00:00.000Z");
  });

  it("parsea fecha numérica MM-DD-YYYY con hora (compras con tarjeta)", () => {
    const date = parseQikDate("07-04-2026 01:11 PM (AST)");
    expect(date?.toISOString()).toBe("2026-07-04T17:11:00.000Z");
  });

  it("parsea fecha numérica con AM", () => {
    const date = parseQikDate("12-25-2026 09:05 AM (AST)");
    expect(date?.toISOString()).toBe("2026-12-25T13:05:00.000Z");
  });

  it("devuelve null con formato irreconocible", () => {
    expect(parseQikDate("hace un rato")).toBeNull();
  });

  it("devuelve null con un mes inexistente", () => {
    expect(parseQikDate("18 de xyz 2026")).toBeNull();
  });
});

describe("isIgnorableQikEmail", () => {
  it("ignora código CASH creado para ti", () => {
    expect(isIgnorableQikEmail("Código CASH para ti creado.")).toBe(true);
  });

  it("ignora código CASH creado para otra persona", () => {
    expect(isIgnorableQikEmail("Código CASH para otra persona creado.")).toBe(true);
  });

  it("ignora código CASH vencido", () => {
    expect(isIgnorableQikEmail("El Código CASH se ha vencido")).toBe(true);
  });

  it("ignora estados de cuenta", () => {
    expect(isIgnorableQikEmail("Estado de cuenta de tu Tarjeta de Crédito QIK")).toBe(true);
    expect(isIgnorableQikEmail("Estado de Cuenta")).toBe(true);
  });

  it("ignora recordatorio de fecha de pago", () => {
    expect(isIgnorableQikEmail("¡Tu fecha de pago se acerca!")).toBe(true);
  });

  it("no ignora un pago de servicio realizado", () => {
    expect(isIgnorableQikEmail("Pago de servicio realizado")).toBe(false);
  });

  it("no ignora un retiro exitoso", () => {
    expect(isIgnorableQikEmail("Retiro con Código CASH exitoso")).toBe(false);
  });

  it("ignora el OTP de verificación de transacciones", () => {
    expect(isIgnorableQikEmail("Contraseña de uso único para transacciones electrónicas")).toBe(
      true,
    );
  });

  it("ignora la alerta de límite de tarjeta (duplica la notificación real)", () => {
    expect(isIgnorableQikEmail("Cardholder Services Alert")).toBe(true);
  });

  it("ignora una compra declinada aunque el asunto no lo diga", () => {
    expect(
      isIgnorableQikEmail(
        "Se hizo una transacción con tu tarjeta de débito Qik",
        CARD_PURCHASE_DECLINED_HTML,
      ),
    ).toBe(true);
  });

  it("no ignora una compra aprobada con el mismo tipo de asunto", () => {
    expect(
      isIgnorableQikEmail("Usaste tu tarjeta de débito Qik", CARD_PURCHASE_OLD_TEMPLATE_HTML),
    ).toBe(false);
  });
});

describe("htmlToText", () => {
  it("elimina estilos y scripts", () => {
    const text = htmlToText("<style>.a{color:red}</style><p>hola</p><script>x()</script>");
    expect(text).toBe("hola");
  });
});

describe("parseQikEmail (integración con correos reales)", () => {
  it("parsea un pago de servicio realizado como gasto", () => {
    const result = parseQikEmail("Pago de servicio realizado", SERVICE_PAYMENT_HTML);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("Electricidad / Edeeste");
    expect(result!.amount).toBe(1238.43);
    expect(result!.card_last4).toBe("3326");
    expect(result!.date.toISOString()).toBe("2026-07-02T14:57:00.000Z");
    expect(result!.available_balance).toBeNull();
  });

  it("parsea un Toke recibido como ingreso", () => {
    const result = parseQikEmail("💵 Te han enviado un Toke", TOKE_RECEIVED_HTML);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("income");
    expect(result!.merchant).toBe("Harold G Jimenez Castro");
    expect(result!.amount).toBe(19174);
    expect(result!.card_last4).toBeNull();
    expect(result!.date.toISOString()).toBe("2026-06-30T16:00:00.000Z");
  });

  it("parsea un retiro con Código CASH exitoso como gasto", () => {
    const result = parseQikEmail("Retiro con Código CASH exitoso", CASH_WITHDRAWAL_HTML);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("Retiro Código CASH");
    expect(result!.amount).toBe(4000);
    expect(result!.card_last4).toBeNull();
  });

  it("ignora un código CASH creado (no es una transacción completada)", () => {
    expect(parseQikEmail("Código CASH para ti creado.", CASH_CODE_CREATED_HTML)).toBeNull();
  });

  it("parsea una compra con tarjeta de débito como gasto", () => {
    const result = parseQikEmail(" Usaste tu tarjeta de débito Qik ", CARD_PURCHASE_HTML);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("WENDYS SAMBIL");
    expect(result!.amount).toBe(674.99);
    expect(result!.card_last4).toBe("3326");
    expect(result!.date.toISOString()).toBe("2026-07-04T17:11:00.000Z");
    expect(result!.available_balance).toBe(12531.31);
  });

  it("parsea una compra con la plantilla vieja (Lugar/Estatus, monto sin RD)", () => {
    const result = parseQikEmail(
      "Usaste tu tarjeta de débito Qik",
      CARD_PURCHASE_OLD_TEMPLATE_HTML,
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("GOOGLE *Google One");
    expect(result!.amount).toBe(124.76);
    expect(result!.date.toISOString()).toBe("2025-07-22T15:41:00.000Z");
    expect(result!.available_balance).toBeNull();
  });

  it("ignora una compra declinada (la plantilla vieja no la marca en el asunto)", () => {
    const result = parseQikEmail(
      "Se hizo una transacción con tu tarjeta de débito Qik",
      CARD_PURCHASE_DECLINED_HTML,
    );
    expect(result).toBeNull();
  });

  it("parsea un reverso de compra como ingreso", () => {
    const result = parseQikEmail(
      " Se reversó una transacción en tu tarjeta de débito Qik ",
      CARD_REVERSAL_HTML,
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe("income");
    expect(result!.merchant).toBe("VERCEL INC.");
    expect(result!.amount).toBe(20);
    expect(result!.date.toISOString()).toBe("2026-05-27T14:21:00.000Z");
  });

  it("ignora el OTP de verificación transaccional", () => {
    expect(
      parseQikEmail("Contraseña de uso único para transacciones electrónicas", OTP_HTML),
    ).toBeNull();
  });

  it("ignora un correo no reconocido", () => {
    expect(parseQikEmail("Bienvenido a Qik", "<p>Gracias por abrir tu cuenta.</p>")).toBeNull();
  });
});
