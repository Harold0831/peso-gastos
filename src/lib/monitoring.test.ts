import { describe, expect, it } from "vitest";
import { formatIssue } from "./monitoring";

describe("formatIssue", () => {
  it("encabeza con el contexto para agrupar de un vistazo", () => {
    const texto = formatIssue({ context: "sync automático", message: "algo pasó" });
    expect(texto.split("\n")[0]).toContain("sync automático");
    expect(texto).toContain("algo pasó");
  });

  it("incluye los detalles", () => {
    const texto = formatIssue({
      context: "sync",
      message: "2 correos fallaron",
      details: ["No se pudo parsear el correo abc", "No se pudo parsear el correo def"],
    });
    expect(texto).toContain("correo abc");
    expect(texto).toContain("correo def");
  });

  it("recorta la lista larga y dice cuántos quedaron fuera", () => {
    // Un banco que cambia de formato puede fallar en decenas de correos a la
    // vez; el aviso tiene que seguir siendo legible en el teléfono.
    const details = Array.from({ length: 25 }, (_, i) => `error ${i}`);
    const texto = formatIssue({ context: "sync", message: "muchos fallos", details });
    expect(texto).toContain("error 0");
    expect(texto).not.toContain("error 24");
    expect(texto).toContain("y 15 más");
  });

  it("nunca pasa del límite de longitud del webhook", () => {
    const details = Array.from({ length: 10 }, () => "x".repeat(500));
    const texto = formatIssue({ context: "sync", message: "largo", details });
    expect(texto.length).toBeLessThanOrEqual(1500);
    expect(texto.endsWith("…")).toBe(true);
  });

  it("funciona sin detalles", () => {
    expect(() => formatIssue({ context: "cron", message: "solo un mensaje" })).not.toThrow();
  });
});
