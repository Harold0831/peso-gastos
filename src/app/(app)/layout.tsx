import { BottomNav } from "@/components/bottom-nav";
import { AppLockGate } from "@/components/app-lock-gate";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLockGate enabled={isSupabaseConfigured()}>
      <div className="mx-auto min-h-dvh max-w-lg pb-28">
        <div className="animate-screen-in">{children}</div>
        <BottomNav />
      </div>
    </AppLockGate>
  );
}
