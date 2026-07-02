import { Skeleton } from "@/components/skeleton";

export default function TransactionsLoading() {
  return (
    <main className="pt-safe">
      <div className="flex items-center justify-between px-5 py-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-[38px] w-[38px] rounded-pill" />
      </div>

      <div className="flex gap-2 px-5 pb-4">
        <Skeleton className="h-8 w-16 rounded-pill" />
        <Skeleton className="h-8 w-16 rounded-pill" />
        <Skeleton className="h-8 w-20 rounded-pill" />
        <Skeleton className="h-8 w-28 rounded-pill" />
      </div>

      <div className="px-5 pb-2 pt-1">
        <Skeleton className="h-2.5 w-16" />
      </div>
      <div className="mx-5 overflow-hidden rounded-card border border-line bg-card">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-3.5 ${i < 3 ? "border-b border-line" : ""}`}
          >
            <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-pill" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="mt-1.5 h-2.5 w-24" />
            </div>
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </main>
  );
}
