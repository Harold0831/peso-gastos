import { Skeleton } from "@/components/skeleton";

export default function MoreLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-20" />
      </div>
      <section className="mx-5 overflow-hidden rounded-card border border-line bg-card">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-4 py-3.5 ${i < 4 ? "border-b border-line" : ""}`}
          >
            <Skeleton className="h-9 w-9 rounded-pill" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-2.5 w-44" />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
