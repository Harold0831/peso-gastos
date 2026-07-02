import { Skeleton } from "@/components/skeleton";

export default function DashboardLoading() {
  return (
    <main className="px-5 pt-safe">
      {/* Top bar */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-[38px] w-[38px] rounded-pill" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <Skeleton className="h-[38px] w-[38px] rounded-pill" />
      </div>

      {/* Balance card */}
      <div className="rounded-card border border-line bg-card p-6 shadow-card">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-11 w-11 rounded-pill" />
        </div>
        <Skeleton className="mt-4 h-9 w-40" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-[52px] flex-1 rounded-btn" />
          <Skeleton className="h-[52px] flex-1 rounded-btn" />
        </div>
      </div>

      <Skeleton className="mt-3.5 h-[60px] rounded-[14px]" />
      <Skeleton className="mt-3.5 h-[60px] rounded-[14px]" />

      <div className="flex items-center justify-between pb-2.5 pt-6">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3.5 w-16" />
      </div>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-3.5 ${i < 3 ? "border-b border-line" : ""}`}
          >
            <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-pill" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="mt-1.5 h-2.5 w-20" />
            </div>
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </main>
  );
}
