import { getGoals, getHomeCurrency } from "@/lib/data";
import { GoalsList } from "./goals-list";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const [goals, homeCurrency] = await Promise.all([getGoals(), getHomeCurrency()]);
  return <GoalsList goals={goals} currency={homeCurrency} />;
}
