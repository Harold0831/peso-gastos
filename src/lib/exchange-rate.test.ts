import { describe, expect, it } from "vitest";
import { parseErApiResponse } from "./exchange-rate";

describe("parseErApiResponse", () => {
  it("extrae la tasa DOP de una respuesta exitosa", () => {
    const payload = {
      result: "success",
      base_code: "USD",
      rates: { USD: 1, DOP: 61.2345, EUR: 0.92 },
    };
    expect(parseErApiResponse(payload)).toBe(61.2345);
  });

  it("devuelve null si el resultado no es success", () => {
    expect(parseErApiResponse({ result: "error", rates: { DOP: 61 } })).toBeNull();
  });

  it("devuelve null si falta la tasa DOP", () => {
    expect(parseErApiResponse({ result: "success", rates: { EUR: 0.92 } })).toBeNull();
  });

  it("devuelve null ante tasas inválidas o payloads malformados", () => {
    expect(parseErApiResponse({ result: "success", rates: { DOP: 0 } })).toBeNull();
    expect(parseErApiResponse({ result: "success", rates: { DOP: "61" } })).toBeNull();
    expect(parseErApiResponse(null)).toBeNull();
    expect(parseErApiResponse("success")).toBeNull();
    expect(parseErApiResponse({})).toBeNull();
  });
});
