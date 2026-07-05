import { Skeleton } from "@/components/skeleton";

export default function ProfileLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="mx-5 mb-3.5 flex items-center gap-4 rounded-card border border-line bg-card p-5">
        <Skeleton className="h-12 w-12 rounded-pill" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-44" />
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mx-5 mb-3.5 rounded-card border border-line bg-card p-5">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-3.5 w-full" />
          <Skeleton className="mt-2 h-3.5 w-2/3" />
        </div>
      ))}
    </main>
  );
}
