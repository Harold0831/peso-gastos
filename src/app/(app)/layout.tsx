import { BottomNav } from "@/components/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-28">
      <div className="animate-screen-in">{children}</div>
      <BottomNav />
    </div>
  );
}
