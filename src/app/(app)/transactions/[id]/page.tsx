import { notFound } from "next/navigation";
import { getCategories, getTransactionById } from "@/lib/data";
import { ConfirmForm } from "./confirm-form";

export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tx, categories] = await Promise.all([getTransactionById(id), getCategories()]);
  if (!tx) notFound();

  return <ConfirmForm tx={tx} categories={categories.map((c) => c.name)} />;
}
