import { getAllCategories, getHiddenCategoryIds } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { CategoriesClient } from "./categories-client";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [all, hiddenIds] = await Promise.all([getAllCategories(), getHiddenCategoryIds()]);

  return (
    <CategoriesClient
      globals={all.filter((c) => c.user_id === null)}
      custom={all.filter((c) => c.user_id !== null)}
      hiddenIds={hiddenIds}
      demoMode={!isSupabaseConfigured()}
    />
  );
}
