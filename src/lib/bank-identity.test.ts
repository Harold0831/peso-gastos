import { describe, expect, it } from "vitest";
import { UNKNOWN_BANK_ID, bankIdForSender, bankNameForSender } from "./bank-parser";
import { BANK_IDS, SUPPORTED_BANKS } from "./banks";

/**
 * Cada banco tiene DOS identificadores y confundirlos ya costó un bug: el id
 * (`popular`), que es la clave estable con la que se guarda y se consulta, y
 * el nombre (`Banco Popular`), que es para que lo lea una persona.
 *
 * `failed_emails.bank` guardaba el NOMBRE mientras el endpoint de admin
 * filtraba por `?bank=popular`. Resultado: la tabla llena de muestras y el
 * endpoint devolviendo `{"count":0}` — un fallo mudo, sin error ni en el log
 * ni en la respuesta, justo en la herramienta que existe para diagnosticar
 * fallos mudos.
 */

describe("id vs. nombre de banco", () => {
  it("bankIdForSender devuelve un id del catálogo, no un nombre", () => {
    for (const bank of SUPPORTED_BANKS) {
      // Cualquier remitente de ese banco debe resolver a SU id.
      const id = bankIdForSender(`notificaciones@${bank.id}.example`);
      expect(id === bank.id || id === UNKNOWN_BANK_ID).toBe(true);
    }
    // El caso que importa de verdad: un remitente real conocido.
    expect(bankIdForSender("notificaciones@popularenlinea.com")).toBe("popular");
    expect(BANK_IDS).toContain(bankIdForSender("notificaciones@popularenlinea.com"));
  });

  it("un remitente desconocido no se cuela como si fuera un banco", () => {
    expect(bankIdForSender("promociones@spam.example")).toBe(UNKNOWN_BANK_ID);
    expect(BANK_IDS).not.toContain(UNKNOWN_BANK_ID);
  });

  it("id y nombre NO son intercambiables", () => {
    // Si algún día coincidieran, el bug de arriba se volvería invisible.
    expect(bankNameForSender("notificaciones@popularenlinea.com")).toBe("Banco Popular");
    expect(bankNameForSender("notificaciones@popularenlinea.com")).not.toBe(
      bankIdForSender("notificaciones@popularenlinea.com"),
    );
  });

  it("el nombre de cada banco contiene su id, que es lo que hace tolerante al filtro", () => {
    // El endpoint admin filtra con `ilike %bank%` para que sirvan tanto el id
    // como el nombre (las filas guardadas antes del arreglo llevan el nombre).
    // Esa tolerancia solo funciona mientras esto se cumpla: un banco nuevo
    // llamado, por ejemplo, id "brd" / nombre "Banco de Reservas" la rompería
    // en silencio.
    for (const bank of SUPPORTED_BANKS) {
      expect(
        bank.name.toLowerCase().includes(bank.id.toLowerCase()),
        `"${bank.name}" no contiene su id "${bank.id}"`,
      ).toBe(true);
    }
  });
});
