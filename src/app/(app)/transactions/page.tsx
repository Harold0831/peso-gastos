import { getCards, getCategories, getTransactions } from "@/lib/data";
import { TxList } from "./tx-list";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; card?: string }>;
}) {
  const { filter, card } = await searchParams;
  const [transactions, categories, cards] = await Promise.all([
    getTransactions(),
    getCategories(),
    getCards(),
  ]);
  return (
    <TxList
      transactions={transactions}
      initialFilter={filter}
      initialCard={card}
      categories={categories.map((c) => c.name)}
      cards={cards.map((c) => ({ last4: c.last4, nickname: c.nickname }))}
    />
  );
}
