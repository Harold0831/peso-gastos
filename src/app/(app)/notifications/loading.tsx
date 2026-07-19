import { Skeleton } from "@/components/skeleton";

export default function NotificationsLoading() {
  return (
    <main className="pt-safe">
      <div className="flex items-center px-4 py-2">
        <Skeleton className="h-[38px] w-[38px] rounded-pill" />
        <div className="flex flex-1 justify-center">
          <Skeleton className="h-4 w-32" />
        </div>
        <span className="w-[38px]" />
      </div>
      <div className="mx-5 mt-2 overflow-hidden rounded-card border border-line bg-card">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-3.5 ${i < 2 ? "border-b border-line" : ""}`}
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-pill" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-1.5 h-2.5 w-28" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
