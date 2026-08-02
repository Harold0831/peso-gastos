import { getCategories, getHomeCurrency, getRecurringForMonth } from "@/lib/data";
import { RecurringList } from "./recurring-list";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const now = new Date();
  const [items, categories, currency] = await Promise.all([
    getRecurringForMonth(now),
    getCategories(),
    getHomeCurrency(),
  ]);
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  return (
    <RecurringList
      items={items}
      categories={categories.map((c) => c.name)}
      currency={currency}
      monthKey={monthKey}
    />
  );
}
