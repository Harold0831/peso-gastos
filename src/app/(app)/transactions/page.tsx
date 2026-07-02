import { getTransactions } from "@/lib/data";
import { TxList } from "./tx-list";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const transactions = await getTransactions();
  return <TxList transactions={transactions} initialFilter={filter} />;
}
