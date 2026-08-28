import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, setPasswordSchema } from "./schemas";

describe("registerSchema", () => {
  it("acepta un alta válida y normaliza el correo", () => {
    const result = registerSchema.safeParse({
      name: "  Ana  ",
      email: "  Ana@Ejemplo.COM ",
      password: "una frase larga",
    });
    expect(result.success).toBe(true);
    expect(result.data!.email).toBe("ana@ejemplo.com");
    expect(result.data!.name).toBe("Ana");
  });

  it("rechaza contraseñas de menos de 8 caracteres", () => {
    const result = registerSchema.safeParse({
      name: "Ana",
      email: "ana@ejemplo.com",
      password: "corta7",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toMatch(/8 caracteres/);
  });

  it("rechaza correos inválidos", () => {
    const result = registerSchema.safeParse({
      name: "Ana",
      email: "no-es-un-correo",
      password: "una frase larga",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza nombre vacío", () => {
    const result = registerSchema.safeParse({
      name: "   ",
      email: "ana@ejemplo.com",
      password: "una frase larga",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("normaliza el correo para que el login no dependa de mayúsculas", () => {
    const result = loginSchema.safeParse({ email: "ANA@Ejemplo.com", password: "x" });
    expect(result.success).toBe(true);
    expect(result.data!.email).toBe("ana@ejemplo.com");
  });

  it("NO exige 8 caracteres al entrar: una contraseña vieja corta debe poder intentarlo", () => {
    const result = loginSchema.safeParse({ email: "ana@ejemplo.com", password: "corta" });
    expect(result.success).toBe(true);
  });

  it("rechaza contraseña vacía", () => {
    expect(loginSchema.safeParse({ email: "ana@ejemplo.com", password: "" }).success).toBe(false);
  });
});

describe("setPasswordSchema", () => {
  it("acepta solo la contraseña nueva (cuenta de Google sin contraseña previa)", () => {
    const result = setPasswordSchema.safeParse({ password: "una frase larga" });
    expect(result.success).toBe(true);
    expect(result.data!.currentPassword).toBeUndefined();
  });

  it("acepta contraseña actual + nueva (cambio)", () => {
    const result = setPasswordSchema.safeParse({
      currentPassword: "la vieja",
      password: "una frase larga",
    });
    expect(result.success).toBe(true);
  });

  it("exige el mínimo de 8 en la nueva", () => {
    expect(setPasswordSchema.safeParse({ password: "corta7" }).success).toBe(false);
  });
});
