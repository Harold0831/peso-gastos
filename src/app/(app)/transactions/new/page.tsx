import { getCards, getCategories, getHomeCurrency } from "@/lib/data";
import { NewTransactionForm } from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  const [categories, cards, homeCurrency] = await Promise.all([
    getCategories(),
    getCards(),
    getHomeCurrency(),
  ]);
  return (
    <NewTransactionForm
      categories={categories.map((c) => c.name)}
      cards={cards.map((c) => ({ last4: c.last4, nickname: c.nickname }))}
      homeCurrency={homeCurrency}
    />
  );
}
