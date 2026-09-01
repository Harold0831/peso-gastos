/**
 * Mes visible de /transactions, serializado en la URL como "YYYY-MM".
 *
 * Vive en la URL y no solo en estado de React porque ahora es el SERVIDOR
 * quien decide qué transacciones cargar: antes la página traía todo el
 * historial y el cliente escondía lo que no era del mes, así que abrir la
 * lista serializaba años de datos para pintar treinta días.
 *
 * Client-safe: lo usan tanto el server component que consulta como el
 * componente de lista que navega.
 */

/** Fecha → "YYYY-MM" (en hora local, igual que el resto de la app). */
export function monthToParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * "YYYY-MM" → primer día de ese mes. Cualquier cosa inválida (ausente, mal
 * formada, mes 13, un año absurdo) cae al mes actual: el parámetro viene de
 * la URL y puede escribirlo cualquiera, así que nunca debe romper la página.
 *
 * Se construye con `new Date(año, mes, 1)` — hora LOCAL, no UTC — porque el
 * rango del mes se calcula igual en el resto de la app; usar `new Date(iso)`
 * desplazaría el mes en zonas al oeste de Greenwich (como República
 * Dominicana, UTC-4).
 */
export function parseMonthParam(value: string | undefined | null): Date {
  if (!value) return startOfCurrentMonth();

  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return startOfCurrentMonth();

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return startOfCurrentMonth();
  // Peso no existía antes de 2020 y una fecha lejana en el futuro solo puede
  // ser un error o alguien jugando con la URL.
  if (year < 2000 || year > 2100) return startOfCurrentMonth();

  return new Date(year, month - 1, 1);
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
