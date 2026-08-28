import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("acepta la contraseña correcta", async () => {
    const hash = await hashPassword("una frase larga y segura");
    expect(await verifyPassword("una frase larga y segura", hash)).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await hashPassword("una frase larga y segura");
    expect(await verifyPassword("una frase larga y segurA", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("nunca guarda la contraseña en claro y usa el formato esperado", async () => {
    const hash = await hashPassword("contraseña123");
    expect(hash).not.toContain("contraseña123");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("genera un hash distinto para la misma contraseña (salt aleatoria)", async () => {
    const [a, b] = await Promise.all([hashPassword("misma clave"), hashPassword("misma clave")]);
    expect(a).not.toBe(b);
    // Pero ambos validan
    expect(await verifyPassword("misma clave", a)).toBe(true);
    expect(await verifyPassword("misma clave", b)).toBe(true);
  });

  it("normaliza unicode: la misma frase escrita distinto valida igual", async () => {
    // "é" precompuesta vs "e" + acento combinante
    const hash = await hashPassword("café con leche");
    expect(await verifyPassword("café con leche", hash)).toBe(true);
  });

  it("devuelve false (sin lanzar) ante hashes corruptos o de otro formato", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "no-es-un-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$mal$8$1$aaa$bbb")).toBe(false);
    // Formato bcrypt (por si alguna vez se migra desde otro esquema)
    expect(await verifyPassword("x", "$2b$12$abcdefghijklmnopqrstuv")).toBe(false);
  });

  it("soporta contraseñas largas y con emojis", async () => {
    const long = "🔐 " + "x".repeat(150);
    const hash = await hashPassword(long);
    expect(await verifyPassword(long, hash)).toBe(true);
  });
});
