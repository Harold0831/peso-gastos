import { getCategories, getHomeCurrency } from "@/lib/data";
import { NewTransactionForm } from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  const [categories, homeCurrency] = await Promise.all([getCategories(), getHomeCurrency()]);
  return (
    <NewTransactionForm categories={categories.map((c) => c.name)} homeCurrency={homeCurrency} />
  );
}
