import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado AES-256-GCM para los refresh tokens de Gmail guardados en la base
 * de datos. Antes había un solo token en una env var; con multi-usuario hay
 * uno por usuario y no pueden guardarse en texto plano — si la DB se filtra,
 * un refresh token da acceso de lectura al correo completo de esa persona.
 *
 * TOKEN_ENCRYPTION_KEY: 32 bytes en base64 (openssl rand -base64 32).
 * Formato del cifrado: base64(iv[12] + authTag[16] + ciphertext).
 */

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Falta TOKEN_ENCRYPTION_KEY (genera una con: openssl rand -base64 32)");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY debe ser 32 bytes en base64");
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptToken(encrypted: string): string {
  const data = Buffer.from(encrypted, "base64");
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}
