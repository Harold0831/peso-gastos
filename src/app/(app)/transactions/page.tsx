import { getCategories, getTransactions } from "@/lib/data";
import { TxList } from "./tx-list";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const [transactions, categories] = await Promise.all([getTransactions(), getCategories()]);
  return (
    <TxList
      transactions={transactions}
      initialFilter={filter}
      categories={categories.map((c) => c.name)}
    />
  );
}
