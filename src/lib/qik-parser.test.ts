import { describe, expect, it } from "vitest";
import {
  detectType,
  extractCardLast4,
  htmlToText,
  parseAmount,
  parseQikDate,
  parseQikEmail,
} from "./qik-parser";

const EXPENSE_BODY_TEXT = `
Hola Harold,

Te notificamos una transacción con tu tarjeta de débito terminada en 4521.

Localidad: SUPERMERCADO NACIONAL
Fecha y hora: 05-06-2026 02:32 PM (AST)
Monto: RD$ 2,840.50
Balance Disponible: RD$ 48,210.35

Gracias por usar Qik.
`;

const EXPENSE_BODY_HTML = `
<html><body>
<table>
<tr><td><b>Localidad</b></td><td>UBER RIDES</td></tr>
<tr><td><b>Fecha y hora</b></td><td>05-06-2026 11:15 AM (AST)</td></tr>
<tr><td><b>Monto</b></td><td>RD$ 385.00</td></tr>
<tr><td><b>Balance Disponible</b></td><td>RD$ 45,369.85</td></tr>
</table>
<p>Tarjeta **** 4521</p>
</body></html>
`;

const INCOME_BODY_TEXT = `
Has recibido una transferencia.

Localidad: JUAN PEREZ
Fecha y hora: 05-01-2026 08:00 AM (AST)
Monto: RD$ 65,000.00
Balance Disponible: RD$ 113,210.35
`;

describe("parseAmount", () => {
  it("parsea montos con miles y decimales", () => {
    expect(parseAmount("RD$ 2,840.50")).toBe(2840.5);
  });

  it("parsea montos pequeños sin coma", () => {
    expect(parseAmount("RD$ 385.00")).toBe(385);
  });

  it("parsea montos sin decimales", () => {
    expect(parseAmount("RD$ 1,000")).toBe(1000);
  });

  it("acepta RD$ sin espacio", () => {
    expect(parseAmount("RD$385.00")).toBe(385);
  });

  it("devuelve null si no hay monto", () => {
    expect(parseAmount("sin monto aquí")).toBeNull();
  });
});

describe("parseQikDate", () => {
  it("convierte AST (UTC-4) a UTC correctamente", () => {
    const date = parseQikDate("05-06-2026 02:32 PM (AST)");
    expect(date?.toISOString()).toBe("2026-05-06T18:32:00.000Z");
  });

  it("maneja 12 AM (medianoche)", () => {
    const date = parseQikDate("05-06-2026 12:05 AM (AST)");
    expect(date?.toISOString()).toBe("2026-05-06T04:05:00.000Z");
  });

  it("maneja 12 PM (mediodía)", () => {
    const date = parseQikDate("05-06-2026 12:30 PM (AST)");
    expect(date?.toISOString()).toBe("2026-05-06T16:30:00.000Z");
  });

  it("devuelve null con formato inválido", () => {
    expect(parseQikDate("6 de mayo de 2026")).toBeNull();
  });
});

describe("detectType", () => {
  it("detecta gasto por 'transacción' en el asunto", () => {
    expect(detectType("Notificación de transacción", "")).toBe("expense");
  });

  it("detecta gasto por 'compra' en el asunto", () => {
    expect(detectType("Compra realizada con tu tarjeta", "")).toBe("expense");
  });

  it("detecta ingreso por 'transferencia recibida'", () => {
    expect(detectType("Transferencia recibida", "")).toBe("income");
  });

  it("detecta ingreso por 'depósito' con tilde", () => {
    expect(detectType("Depósito a tu cuenta", "")).toBe("income");
  });

  it("refuerza con el cuerpo cuando el asunto es ambiguo", () => {
    expect(detectType("Notificación Qik", "Has recibido una transferencia de Juan")).toBe("income");
  });

  it("por defecto es gasto si no hay señales de ingreso", () => {
    expect(detectType("Notificación Qik", "movimiento en tu cuenta")).toBe("expense");
  });
});

describe("extractCardLast4", () => {
  it("extrae de 'terminada en 4521'", () => {
    expect(extractCardLast4("", "tarjeta terminada en 4521")).toBe("4521");
  });

  it("extrae de asteriscos '**** 4521'", () => {
    expect(extractCardLast4("", "Tarjeta **** 4521")).toBe("4521");
  });

  it("extrae del asunto", () => {
    expect(extractCardLast4("Transacción tarjeta 9876", "")).toBe("9876");
  });

  it("devuelve null si no hay tarjeta (transferencias)", () => {
    expect(extractCardLast4("Transferencia recibida", "Has recibido RD$ 500.00")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("convierte celdas de tabla en líneas (label y valor separados)", () => {
    const text = htmlToText("<tr><td>Monto</td><td>RD$ 100.00</td></tr>");
    expect(text.split("\n")).toEqual(["Monto", "RD$ 100.00"]);
  });

  it("elimina estilos y scripts", () => {
    const text = htmlToText("<style>.a{color:red}</style><p>hola</p><script>x()</script>");
    expect(text).toBe("hola");
  });
});

describe("parseQikEmail (integración)", () => {
  it("parsea un correo de gasto en texto plano", () => {
    const result = parseQikEmail("Notificación de transacción", EXPENSE_BODY_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("SUPERMERCADO NACIONAL");
    expect(result!.amount).toBe(2840.5);
    expect(result!.available_balance).toBe(48210.35);
    expect(result!.card_last4).toBe("4521");
    expect(result!.date.toISOString()).toBe("2026-05-06T18:32:00.000Z");
    expect(result!.currency).toBe("DOP");
  });

  it("parsea un correo de gasto en HTML con tabla", () => {
    const result = parseQikEmail("Compra con tu tarjeta Qik", EXPENSE_BODY_HTML);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("expense");
    expect(result!.merchant).toBe("UBER RIDES");
    expect(result!.amount).toBe(385);
    expect(result!.card_last4).toBe("4521");
  });

  it("parsea un correo de transferencia recibida", () => {
    const result = parseQikEmail("Transferencia recibida", INCOME_BODY_TEXT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("income");
    expect(result!.merchant).toBe("JUAN PEREZ");
    expect(result!.amount).toBe(65000);
    expect(result!.card_last4).toBeNull();
  });

  it("devuelve null si falta el monto", () => {
    const body = "Localidad: X\nFecha y hora: 05-06-2026 02:32 PM (AST)";
    expect(parseQikEmail("Notificación de transacción", body)).toBeNull();
  });

  it("devuelve null si falta la localidad", () => {
    const body = "Fecha y hora: 05-06-2026 02:32 PM (AST)\nMonto: RD$ 100.00";
    expect(parseQikEmail("Notificación de transacción", body)).toBeNull();
  });

  it("devuelve null con un correo no transaccional", () => {
    expect(parseQikEmail("Bienvenido a Qik", "Gracias por abrir tu cuenta.")).toBeNull();
  });
});
