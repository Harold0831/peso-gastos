import { Skeleton } from "@/components/skeleton";

export default function RecurringLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-3 w-40" />
      </div>
      <div className="flex flex-col gap-2.5 px-5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-card border border-line bg-card p-4"
          >
            <Skeleton className="h-9 w-9 rounded-pill" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-40" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
