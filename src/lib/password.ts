import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

/**
 * Hashing de contraseñas para el login con correo (además del de Google).
 *
 * Usa **scrypt** de `node:crypto` en vez de bcrypt/argon2 por dependencia:
 * el proyecto ya evita paquetes pesados (ver § Decisiones técnicas) y scrypt
 * viene en Node, es memory-hard (más caro de atacar con GPU que bcrypt) y
 * está avalado por OWASP.
 *
 * Formato guardado: `scrypt$N$r$p$saltBase64$hashBase64` — auto-descriptivo,
 * así que subir los parámetros en el futuro no invalida los hashes viejos
 * (cada uno trae los suyos).
 */

// 128 * N * r = ~32 MB de memoria por hash y ~100ms de CPU: suficiente para
// que un ataque por fuerza bruta sobre la red sea inviable, sin ahogar una
// función serverless.
const N = 32768; // 2^15
const R = 8;
const P = 1;
const KEY_LEN = 64;
// El default de maxmem en Node es 32 MB justos — con N=2^15 se queda corto
// y scrypt lanza; se sube explícitamente.
const MAX_MEM = 96 * 1024 * 1024;

/** scrypt con opciones, prometificado a mano (promisify no tipa esta forma). */
function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password.normalize("NFKC"),
      salt,
      KEY_LEN,
      { N: n, r, p, maxmem: MAX_MEM },
      (err, derivedKey) => (err ? reject(err) : resolve(derivedKey)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Verifica una contraseña contra el hash guardado. Devuelve false (nunca
 * lanza) ante un hash con formato inválido o corrupto, para que el endpoint
 * de login responda siempre igual y no filtre información.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

    const expected = Buffer.from(hashB64, "base64");
    const actual = await derive(password, Buffer.from(saltB64, "base64"), n, r, p);
    // Longitudes distintas revientan timingSafeEqual, así que se chequea antes.
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
