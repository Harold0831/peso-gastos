import { Skeleton } from "@/components/skeleton";

export default function MoreLoading() {
  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <Skeleton className="h-8 w-20" />
      </div>
      {/* Mismos dos grupos (4 + 2) que la pantalla real, para que el
          esqueleto no salte al llegar los datos. */}
      {[4, 2].map((rows, group) => (
        <section key={group} className="mx-5 mb-5">
          <Skeleton className="mb-2 ml-1 h-3 w-24" />
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {Array.from({ length: rows }).map((_, i) => (
              <div
                key={i}
                className={`flex items-center gap-3.5 px-4 py-4 ${
                  i < rows - 1 ? "border-b border-line" : ""
                }`}
              >
                <Skeleton className="h-10 w-10 rounded-pill" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-44" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
