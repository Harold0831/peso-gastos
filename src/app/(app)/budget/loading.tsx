import { Skeleton } from "@/components/skeleton";

export default function BudgetLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-3.5 w-24" />
      </div>

      <div className="mx-5 mb-4 rounded-card border border-line bg-card p-5">
        <div className="mb-3.5 flex items-baseline justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-12" />
        </div>
        <Skeleton className="mb-2.5 h-2 w-full rounded-pill" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[14px] border border-line bg-card p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 rounded-pill" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="mb-2 h-1.5 w-full rounded-pill" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        ))}
      </div>
    </main>
  );
}
