import { getCategories } from "@/lib/data";
import { NewTransactionForm } from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  const categories = await getCategories();
  return <NewTransactionForm categories={categories.map((c) => c.name)} />;
}
