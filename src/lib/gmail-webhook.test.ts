import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPubSubPushToken } from "./gmail-webhook";

describe("verifyPubSubPushToken", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rechaza si falta GMAIL_WEBHOOK_AUDIENCE", async () => {
    vi.stubEnv("GMAIL_WEBHOOK_AUDIENCE", "");
    expect(await verifyPubSubPushToken("Bearer algo")).toBe(false);
  });

  it("rechaza si no hay header Authorization", async () => {
    vi.stubEnv("GMAIL_WEBHOOK_AUDIENCE", "https://peso.example.com/api/gmail-webhook");
    expect(await verifyPubSubPushToken(null)).toBe(false);
  });

  it("rechaza un header que no empieza con 'Bearer '", async () => {
    vi.stubEnv("GMAIL_WEBHOOK_AUDIENCE", "https://peso.example.com/api/gmail-webhook");
    expect(await verifyPubSubPushToken("Token abc")).toBe(false);
  });

  it("rechaza un JWT con formato inválido", async () => {
    vi.stubEnv("GMAIL_WEBHOOK_AUDIENCE", "https://peso.example.com/api/gmail-webhook");
    expect(await verifyPubSubPushToken("Bearer no-es-un-jwt")).toBe(false);
  });
});
