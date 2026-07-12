import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./api-token";

describe("api-token", () => {
  it("genera tokens únicos y de longitud razonable", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    // 48 bytes en base64url ≈ 64 chars, sin caracteres no-URL-safe
    expect(a.length).toBeGreaterThanOrEqual(60);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashea de forma determinística (mismo token → mismo hash)", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("tokens distintos producen hashes distintos", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });

  it("el hash es SHA-256 en hex (64 chars)", () => {
    expect(hashToken("cualquier-cosa")).toMatch(/^[a-f0-9]{64}$/);
  });
});
