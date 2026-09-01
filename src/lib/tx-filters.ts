/**
 * Pestañas de /transactions. Vive fuera del componente porque el SERVIDOR
 * también las necesita: "Por confirmar" no carga las mismas filas que el
 * resto (es global, no del mes visible), así que la pestaña activa decide la
 * consulta y no solo cómo se pinta la lista.
 */
export type TxFilter = "todos" | "gastos" | "ingresos" | "pendientes";

export const TX_FILTERS: { id: TxFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "gastos", label: "Gastos" },
  { id: "ingresos", label: "Ingresos" },
  { id: "pendientes", label: "Por confirmar" },
];

/** Valor de la URL → pestaña. Cualquier cosa desconocida cae en "todos". */
export function parseFilterParam(value: string | undefined | null): TxFilter {
  return TX_FILTERS.some((f) => f.id === value) ? (value as TxFilter) : "todos";
}
