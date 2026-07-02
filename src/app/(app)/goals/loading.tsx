import { Skeleton } from "@/components/skeleton";

export default function GoalsLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="flex flex-col gap-3 px-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-line bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-pill" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
              </div>
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="mb-2 h-2 w-full rounded-pill" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        ))}
      </div>
    </main>
  );
}
