import { notFound } from "next/navigation";
import { getCards, getCategories, getTransactionById } from "@/lib/data";
import { ConfirmForm } from "./confirm-form";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tx, categories, cards] = await Promise.all([
    getTransactionById(id),
    getCategories(),
    getCards(),
  ]);
  if (!tx) notFound();

  // Si la tarjeta está registrada, se muestra su nombre en vez de los
  // últimos 4 pelados.
  const cardName = cards.find((c) => c.last4 === tx.card_last4)?.nickname ?? null;

  return <ConfirmForm tx={tx} categories={categories.map((c) => c.name)} cardName={cardName} />;
}
