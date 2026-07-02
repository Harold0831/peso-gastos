const LAST_AUTH_KEY = "peso-last-auth";

/**
 * Tiempo en segundo plano (o desde el último desbloqueo) tras el cual
 * Peso vuelve a pedir Face ID. sessionStorage se limpia solo cuando el
 * sistema mata el proceso de la PWA por completo (cerrarla de verdad), así
 * que ese caso siempre bloquea sin depender de este umbral.
 */
const INACTIVITY_THRESHOLD_MS = 30_000;

export function markAuthenticated(): void {
  sessionStorage.setItem(LAST_AUTH_KEY, String(Date.now()));
}

export function isLockRequired(): boolean {
  const lastAuth = Number(sessionStorage.getItem(LAST_AUTH_KEY) ?? 0);
  return !lastAuth || Date.now() - lastAuth > INACTIVITY_THRESHOLD_MS;
}
