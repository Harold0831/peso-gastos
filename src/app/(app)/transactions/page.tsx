import {
  getCards,
  getCategories,
  getPendingCount,
  getPendingTransactions,
  getTransactions,
} from "@/lib/data";
import { parseMonthParam } from "@/lib/month-param";
import { parseFilterParam } from "@/lib/tx-filters";
import { TxList } from "./tx-list";

export const dynamic = "force-dynamic";

/**
 * La consulta se acota a lo que la vista muestra de verdad.
 *
 * Antes esta página llamaba a `getTransactions()` SIN límite y el cliente
 * escondía todo lo que no fuera del mes visible: para pintar treinta días se
 * serializaba el historial entero en el payload RSC, en cada visita a la
 * pestaña. Con un año y un banco ya eran cientos de filas; con varios años y
 * seis bancos, miles.
 *
 * Ahora el mes vive en la URL (`?m=YYYY-MM`) y decide la consulta. La vista
 * "Por confirmar" es la excepción: es global (una pendiente vieja no debe
 * esconderse por cambiar de mes), así que tiene su propia consulta acotada
 * por estado en vez de por fecha.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; card?: string; m?: string }>;
}) {
  const { filter, card, m } = await searchParams;
  const month = parseMonthParam(m);
  const activeFilter = parseFilterParam(filter);
  const showingPending = activeFilter === "pendientes";

  const [transactions, pendingCount, categories, cards] = await Promise.all([
    showingPending ? getPendingTransactions() : getTransactions({ month }),
    // El badge de la pestaña es global, así que no sale de las filas
    // cargadas: es un count(*) barato que no trae ninguna fila.
    getPendingCount(),
    getCategories(),
    getCards(),
  ]);

  return (
    <TxList
      transactions={transactions}
      month={month}
      filter={activeFilter}
      initialCard={card}
      pendingCount={pendingCount}
      categories={categories.map((c) => c.name)}
      cards={cards.map((c) => ({ last4: c.last4, nickname: c.nickname }))}
    />
  );
}
