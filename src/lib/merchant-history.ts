/**
 * Reglas de auto-confirmación: si ya categorizaste un comercio varias veces,
 * la próxima igual se confirma sola con esa categoría.
 *
 * Por qué existe: toda transacción importada por correo llegaba como "por
 * confirmar", aunque fuera la quinta vez que llega el mismo Netflix. Un
 * usuario real acumuló 244 pendientes — a esa altura la pantalla ya no es una
 * bandeja, es una deuda que nadie va a pagar.
 *
 * Todo aquí es PURO (sin base de datos, sin fechas, sin red) para poder fijar
 * las reglas con tests: son decisiones automáticas sobre el dinero de alguien
 * y conviene que estén clavadas, no que dependan de leer bien `sync.ts`.
 */

/** Una transacción ya confirmada por el usuario, con lo mínimo que hace falta. */
export interface ConfirmedRow {
  merchant: string;
  category: string;
  /** En su moneda original; ver la nota de `maxAmount` en `MerchantRule`. */
  amount: number;
}

export interface MerchantRule {
  category: string;
  /** Cuántas veces se categorizó así (ver MIN_OCCURRENCES). */
  count: number;
  /** El monto más alto visto. Base del tope de seguridad; ver `matchesRule`. */
  maxAmount: number;
}

/**
 * Veces que hay que categorizar un comercio igual para que Peso lo asuma.
 *
 * Dos y no una: una sola vez no es una costumbre, es una casualidad. Con dos
 * ya hay intención repetida, y el coste de equivocarse es bajo (la
 * transacción sigue ahí y se puede recategorizar).
 */
export const MIN_OCCURRENCES = 2;

/**
 * Tope de seguridad sobre el monto: no se auto-confirma nada que supere el
 * doble del máximo histórico de ese comercio.
 *
 * Esta es la red que justifica todo lo demás. "Confirmar" no solo asigna
 * categoría — también es tu oportunidad de ver un cargo que no reconoces. Si
 * Peso confirma solo, alguien que nunca mira la lista no se enteraría de un
 * cobro raro de un comercio que SÍ conoce (una suscripción que subió de
 * precio, un cobro duplicado, un monto tecleado mal en el comercio).
 *
 * El doble del máximo funciona para los dos extremos sin configurar nada:
 * Netflix siempre RD$649 → un cargo de RD$6,490 se detiene; un supermercado
 * con historial de RD$200 a RD$5,000 tolera hasta RD$10,000 porque su propio
 * historial ya dice que varía.
 */
export const MAX_AMOUNT_FACTOR = 2;

/**
 * Normaliza el nombre del comercio para comparar.
 *
 * Solo espacios y mayúsculas: es coincidencia EXACTA a propósito. La tentación
 * es hacerla difusa para cazar variantes, pero los comercios reales de los
 * bancos dominicanos se parecen demasiado entre sí como para arriesgarse:
 * `PedidosYa*Pizza Hut La` y `PedidosYa*Wendys` comparten prefijo y podrían ir
 * a categorías distintas. Categorizar mal en automático es peor que preguntar,
 * así que se empieza estricto; con datos reales se puede aflojar después.
 */
export function normalizeMerchant(merchant: string): string {
  return merchant.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Historial confirmado → reglas por comercio.
 *
 * Cuando un comercio tiene categorías distintas en su historial gana la MÁS
 * FRECUENTE, y el conteo es el de esa categoría (no el total): si clasificaste
 * "Uber" nueve veces como Transporte y una como Trabajo, la regla es
 * Transporte con 9 — ese único caso raro no debe frenar la automatización ni,
 * peor, imponerse.
 */
export function buildMerchantRules(rows: ConfirmedRow[]): Map<string, MerchantRule> {
  // comercio → categoría → { veces, monto máximo }
  const tally = new Map<string, Map<string, { count: number; maxAmount: number }>>();

  for (const row of rows) {
    if (!row.merchant || !row.category) continue;
    const key = normalizeMerchant(row.merchant);
    if (!key) continue;

    const byCategory = tally.get(key) ?? new Map();
    const current = byCategory.get(row.category) ?? { count: 0, maxAmount: 0 };
    current.count += 1;
    current.maxAmount = Math.max(current.maxAmount, row.amount);
    byCategory.set(row.category, current);
    tally.set(key, byCategory);
  }

  const rules = new Map<string, MerchantRule>();
  for (const [merchant, byCategory] of tally) {
    let best: MerchantRule | null = null;
    for (const [category, { count, maxAmount }] of byCategory) {
      if (!best || count > best.count) best = { category, count, maxAmount };
    }
    if (best && best.count >= MIN_OCCURRENCES) rules.set(merchant, best);
  }
  return rules;
}

export interface AutoConfirmMatch {
  category: string;
}

/**
 * ¿Esta transacción nueva se puede confirmar sola?
 *
 * Devuelve la categoría a aplicar, o null si hay que preguntarle al usuario.
 * Las tres condiciones (comercio conocido, historial suficiente, monto dentro
 * de lo normal) están documentadas arriba.
 */
export function matchesRule(
  tx: { merchant: string; amount: number },
  rules: Map<string, MerchantRule>,
): AutoConfirmMatch | null {
  const rule = rules.get(normalizeMerchant(tx.merchant));
  if (!rule) return null;
  if (rule.count < MIN_OCCURRENCES) return null;
  if (tx.amount > rule.maxAmount * MAX_AMOUNT_FACTOR) return null;
  return { category: rule.category };
}
