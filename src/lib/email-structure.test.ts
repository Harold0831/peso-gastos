import { describe, expect, it } from "vitest";
import { describeEmailStructure, labelsPresent } from "./email-structure";

/**
 * Lo que estos tests protegen no es un formato: es la PROMESA de que el
 * esqueleto no lleva datos de nadie. La política de privacidad dice que el
 * cuerpo del correo se descarta y no se comparte, así que si alguien afloja
 * la lista blanca y empieza a filtrar comercios o montos, esto tiene que
 * fallar.
 */

const CORREO_POPULAR = `
Notificación de Consumo
Estimado JUAN PEREZ
Monto
Moneda
Fecha
Comercio
RD$2,840.50
DOP
01/09/2026
SUPERMERCADO NACIONAL, S.A.
`;

describe("describeEmailStructure", () => {
  it("muestra las etiquetas conocidas literales", () => {
    const skeleton = describeEmailStructure(CORREO_POPULAR).join("\n");
    expect(skeleton).toContain('"Monto"');
    expect(skeleton).toContain('"Fecha"');
    expect(skeleton).toContain('"Comercio"');
  });

  it("NO filtra el comercio", () => {
    // El caso que más importa: los nombres de comercio no llevan números, así
    // que una heurística tipo "muestra lo que no tenga dígitos" los dejaría
    // pasar. Por eso la lista es blanca.
    const skeleton = describeEmailStructure(CORREO_POPULAR).join("\n");
    expect(skeleton).not.toContain("SUPERMERCADO");
    expect(skeleton).not.toContain("NACIONAL");
  });

  it("NO filtra el monto ni el nombre del titular", () => {
    const skeleton = describeEmailStructure(CORREO_POPULAR).join("\n");
    expect(skeleton).not.toContain("2,840");
    expect(skeleton).not.toContain("2840");
    expect(skeleton).not.toContain("JUAN");
    expect(skeleton).not.toContain("PEREZ");
  });

  it("NO filtra fechas ni números de tarjeta", () => {
    const skeleton = describeEmailStructure("Tarjeta\n49***...3326\nFecha\n01/09/2026").join("\n");
    expect(skeleton).not.toContain("3326");
    expect(skeleton).not.toContain("01/09/2026");
  });

  it("conserva el orden, que es justo lo que hace falta para el parser", () => {
    const skeleton = describeEmailStructure(CORREO_POPULAR);
    const posMonto = skeleton.findIndex((l) => l.includes('"Monto"'));
    const posComercio = skeleton.findIndex((l) => l.includes('"Comercio"'));
    expect(posMonto).toBeGreaterThanOrEqual(0);
    expect(posComercio).toBeGreaterThan(posMonto);
  });

  it("numera las líneas para poder hablar de 'la línea 7'", () => {
    expect(describeEmailStructure("Monto\nRD$100.00")[0]).toMatch(/^\s*1\./);
  });

  it("describe la forma de los valores sin revelarlos", () => {
    const skeleton = describeEmailStructure("RD$2,840.50\nhttps://banco.com/x").join("\n");
    expect(skeleton).toContain("‹monto›");
    expect(skeleton).toContain("‹enlace›");
  });

  it("ignora líneas vacías y recorta los correos largos", () => {
    const largo = Array.from({ length: 60 }, (_, i) => `linea ${i}`).join("\n\n");
    const skeleton = describeEmailStructure(largo);
    expect(skeleton.length).toBeLessThanOrEqual(36);
    expect(skeleton.at(-1)).toContain("más");
  });

  it("no rompe con un cuerpo vacío", () => {
    expect(describeEmailStructure("")).toEqual([]);
  });

  it("reconoce etiquetas con acentos y dos puntos", () => {
    const skeleton = describeEmailStructure("Descripción:\nAutorización:").join("\n");
    expect(skeleton).toContain("etiqueta conocida");
    expect(skeleton.match(/etiqueta conocida/g)).toHaveLength(2);
  });
});

describe("labelsPresent", () => {
  it("lista qué etiquetas conocidas trae el correo", () => {
    const labels = labelsPresent(CORREO_POPULAR);
    expect(labels).toContain("monto");
    expect(labels).toContain("comercio");
  });

  it("permite ver de un vistazo cuál se perdió", () => {
    // Este es el uso real: el parser del Popular busca Comercio; si el banco
    // lo renombró, aquí se ve que ya no está.
    const labels = labelsPresent("Monto\nFecha\nEstatus");
    expect(labels).not.toContain("comercio");
  });

  it("no inventa etiquetas a partir del contenido", () => {
    expect(labelsPresent("SUPERMERCADO NACIONAL")).toEqual([]);
  });
});
