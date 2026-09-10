/**
 * Regla del aviso de presupuesto, en un solo sitio.
 *
 * La usan DOS caminos que obtienen los datos de forma distinta:
 *  - `confirmTransaction` (actions.ts), con la sesión del usuario abierta.
 *  - el sync automático (sync.ts), que corre desde un webhook SIN sesión y
 *    tiene que consultar con el `user_id` explícito.
 *
 * Lo que no puede divergir entre los dos es la REGLA: cuándo se avisa y con
 * qué texto. Si un camino avisara al 80% y el otro al 90%, la app se
 * comportaría distinto según cómo se confirmó la transacción — un bug
 * silencioso y muy molesto de diagnosticar. Por eso vive aquí, pura y con
 * tests, y cada camino solo aporta los números.
 */

export type BudgetCrossing = "over" | "warn";

/** Umbral de aviso temprano (80% del presupuesto). */
export const WARN_THRESHOLD = 0.8;

/**
 * ¿Este gasto acaba de CRUZAR un umbral?
 *
 * Cruzar, no estar por encima: se compara el antes y el después, así que solo
 * avisa la vez que se pasa la raya. Sin esto, cada gasto posterior del mes
 * volvería a notificar lo mismo y el usuario apagaría las notificaciones.
 */
export function detectBudgetCrossing(
  limit: number,
  spentAfter: number,
  added: number,
): BudgetCrossing | null {
  if (limit <= 0 || added <= 0) return null;
  const after = spentAfter / limit;
  const before = (spentAfter - added) / limit;

  if (before < 1 && after >= 1) return "over";
  if (before < WARN_THRESHOLD && after >= WARN_THRESHOLD) return "warn";
  return null;
}

/**
 * Texto del aviso. Recibe los montos ya formateados para no arrastrar aquí la
 * moneda de casa ni `formatMoney`.
 */
export function budgetAlertBody(
  crossing: BudgetCrossing,
  categoryName: string,
  spentFormatted: string,
  limitFormatted: string,
  percent: number,
): string {
  return crossing === "over"
    ? `Superaste el presupuesto de ${categoryName}: ${spentFormatted} de ${limitFormatted}`
    : `Vas por el ${percent}% del presupuesto de ${categoryName}`;
}
