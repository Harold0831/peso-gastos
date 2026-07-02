import { startAuthentication } from "@simplewebauthn/browser";

export type PasskeyResult =
  | { ok: true }
  | { ok: false; noCredentials: true }
  | { ok: false; noCredentials?: false; error: string };

/**
 * Dispara el prompt de Face ID/Touch ID contra el passkey ya registrado y
 * verifica la respuesta con el servidor (que además refresca la cookie de
 * sesión). Compartida entre /login (primer acceso) y AppLockGate
 * (re-verificación al volver de background).
 */
export async function verifyPasskey(): Promise<PasskeyResult> {
  const optionsRes = await fetch("/api/auth/login/options", { method: "POST" });
  if (optionsRes.status === 404) {
    return { ok: false, noCredentials: true };
  }
  if (!optionsRes.ok) {
    return { ok: false, error: "No se pudieron obtener las opciones de login" };
  }

  try {
    const optionsJSON = await optionsRes.json();
    const assertion = await startAuthentication({ optionsJSON });

    const verifyRes = await fetch("/api/auth/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assertion),
    });
    if (!verifyRes.ok) {
      const body = await verifyRes.json().catch(() => null);
      return { ok: false, error: body?.error ?? "Verificación fallida" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Algo salió mal, intenta de nuevo",
    };
  }
}
