import { Skeleton } from "@/components/skeleton";

export default function CategoriesLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-3 w-64" />
      </div>
      {[0, 1].map((section) => (
        <div key={section} className="mx-5 mb-3.5">
          <Skeleton className="mb-2 h-3 w-28" />
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-4 py-3 ${i < 2 ? "border-b border-line" : ""}`}
              >
                <Skeleton className="h-8 w-8 rounded-pill" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
