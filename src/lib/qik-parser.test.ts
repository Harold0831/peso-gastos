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

  it("ignora un correo no reconocido", () => {
    expect(parseQikEmail("Bienvenido a Qik", "<p>Gracias por abrir tu cuenta.</p>")).toBeNull();
  });
});
