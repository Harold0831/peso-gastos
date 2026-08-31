import { describe, expect, it } from "vitest";
import { AUTH_LIMITS, clientIp } from "./rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("https://peso.app/api/auth/email/login", { method: "POST", headers });
}

describe("clientIp", () => {
  it("prefiere x-real-ip, que en Vercel lo pone la plataforma", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1" }))).toBe(
      "203.0.113.7",
    );
  });

  it("usa x-forwarded-for cuando no hay x-real-ip", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("toma la ÚLTIMA entrada de x-forwarded-for, no la primera", () => {
    // La izquierda puede haberla escrito el propio cliente; la derecha la
    // añade el proxy de confianza. Tomar la primera dejaría que cualquiera se
    // inventara una IP distinta en cada petición y esquivara el límite.
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 10.0.0.1, 203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("ignora espacios y entradas vacías", () => {
    expect(clientIp(req({ "x-forwarded-for": "  1.1.1.1 ,  , 203.0.113.7  " }))).toBe(
      "203.0.113.7",
    );
  });

  it("cae a una clave fija cuando no hay cabeceras (dev local)", () => {
    expect(clientIp(req({}))).toBe("desconocida");
  });

  it("no confunde una cabecera vacía con una IP", () => {
    expect(clientIp(req({ "x-real-ip": "   ", "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });
});

describe("AUTH_LIMITS", () => {
  it("el alta es el límite más estrecho: cada intento cuesta un scrypt", () => {
    expect(AUTH_LIMITS.register.limit).toBeLessThan(AUTH_LIMITS.login.limit);
  });

  it("todos los límites son positivos y con ventana finita", () => {
    for (const [nombre, { limit, windowSeconds }] of Object.entries(AUTH_LIMITS)) {
      expect(limit, nombre).toBeGreaterThan(0);
      expect(windowSeconds, nombre).toBeGreaterThan(0);
    }
  });
});
