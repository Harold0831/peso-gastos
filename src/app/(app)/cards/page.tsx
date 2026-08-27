import { getCardsForMonth, getHomeCurrency, getUnregisteredCards } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { CardsClient } from "./cards-client";

export const dynamic = "force-dynamic";

export default async function CardsPage() {
  const now = new Date();
  const [cards, unregistered, currency] = await Promise.all([
    getCardsForMonth(now),
    getUnregisteredCards(),
    getHomeCurrency(),
  ]);

  return (
    <CardsClient
      cards={cards}
      unregistered={unregistered}
      currency={currency}
      demoMode={!isSupabaseConfigured()}
    />
  );
}
