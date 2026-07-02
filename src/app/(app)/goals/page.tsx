import { getGoals } from "@/lib/data";
import { GoalsList } from "./goals-list";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await getGoals();
  return <GoalsList goals={goals} />;
}
