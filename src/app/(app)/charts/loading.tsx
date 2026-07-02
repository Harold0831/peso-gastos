import { Skeleton } from "@/components/skeleton";

export default function ChartsLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="flex items-center justify-center gap-6 pb-4">
        <Skeleton className="h-5 w-5" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-5" />
      </div>

      <div className="flex gap-2 px-5 pb-4">
        <Skeleton className="h-[64px] flex-1 rounded-[14px]" />
        <Skeleton className="h-[64px] flex-1 rounded-[14px]" />
        <Skeleton className="h-[64px] flex-1 rounded-[14px]" />
      </div>

      <div className="mx-5 rounded-card border border-line bg-card p-5">
        <Skeleton className="mb-4 h-3 w-28" />
        <div className="flex justify-center">
          <Skeleton className="h-44 w-44 rounded-pill" />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Skeleton className="h-2 w-2 shrink-0 rounded-pill" />
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-2.5 w-8" />
            </div>
          ))}
        </div>
      </div>

      <div className="mx-5 mt-3.5 rounded-card border border-line bg-card p-5">
        <Skeleton className="mb-4 h-3 w-24" />
        <Skeleton className="h-20 w-full" />
      </div>
    </main>
  );
}
