import Link from "next/link";
import { addMonths, format, subMonths } from "date-fns";
import { getCategorySpend, getDailyExpenses, getMonthSummary } from "@/lib/data";
import { formatMoney, formatMonthLabel } from "@/lib/format";
import { CategoryDonut, DailyBars } from "./charts-client";

export const dynamic = "force-dynamic";

function parseMonth(m?: string): Date {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    return new Date(`${m}-01T00:00:00`);
  }
  return new Date();
}

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const month = parseMonth(m);
  const [summary, categorySpend, dailyExpenses] = await Promise.all([
    getMonthSummary(month),
    getCategorySpend(month),
    getDailyExpenses(month),
  ]);

  const totalSpend = categorySpend.reduce((s, c) => s + c.amount, 0);
  const prev = format(subMonths(month, 1), "yyyy-MM");
  const next = format(addMonths(month, 1), "yyyy-MM");

  const summaryCards = [
    { label: "Ingresos", value: summary.income, className: "text-income", sign: "+" },
    { label: "Gastos", value: summary.expenses, className: "text-expense", sign: "−" },
    { label: "Neto", value: summary.net, className: "text-ink", sign: "" },
  ];

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Gráficas</h1>
      </div>

      {/* Selector de mes */}
      <div className="flex items-center justify-center gap-6 pb-4">
        <Link href={`/charts?m=${prev}`} className="px-3 py-1 text-lg text-ink-muted">
          ‹
        </Link>
        <span className="min-w-32 text-center text-[15px] font-bold tracking-tight text-ink">
          {formatMonthLabel(month)}
        </span>
        <Link href={`/charts?m=${next}`} className="px-3 py-1 text-lg text-ink-muted">
          ›
        </Link>
      </div>

      {/* Resumen */}
      <div className="flex gap-2 px-5 pb-4">
        {summaryCards.map(({ label, value, className, sign }) => (
          <div key={label} className="flex-1 rounded-[14px] border border-line bg-card p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {label}
            </div>
            <div className={`mt-1 text-sm font-extrabold tracking-tight ${className}`}>
              {sign}
              {formatMoney(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Donut por categoría */}
      <section className="mx-5 rounded-card border border-line bg-card p-5">
        <h2 className="pb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Por categoría
        </h2>
        {categorySpend.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">Sin gastos este mes.</p>
        ) : (
          <>
            <CategoryDonut
              data={categorySpend.map((c) => ({
                name: c.category.name,
                value: c.amount,
                color: c.category.color,
              }))}
              total={totalSpend}
            />
            <div className="mt-4 flex flex-col gap-3">
              {categorySpend.map(({ category, amount }) => {
                const pct = totalSpend > 0 ? amount / totalSpend : 0;
                return (
                  <div key={category.id} className="flex items-center gap-2.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-pill"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[13px] font-semibold text-ink">{category.name}</span>
                        <span className="text-xs font-bold tracking-tight text-ink">
                          {formatMoney(amount)}
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-pill bg-background">
                        <div
                          className="h-full rounded-pill"
                          style={{ width: `${pct * 100}%`, backgroundColor: category.color }}
                        />
                      </div>
                    </div>
                    <span className="w-8 text-right text-[11px] font-semibold text-ink-muted">
                      {Math.round(pct * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Gasto diario */}
      <section className="mx-5 mt-3.5 rounded-card border border-line bg-card p-5">
        <h2 className="pb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Gasto diario
        </h2>
        {summary.expenses === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">Sin gastos este mes.</p>
        ) : (
          <DailyBars data={dailyExpenses.map((amount, i) => ({ day: i + 1, amount }))} />
        )}
      </section>
    </main>
  );
}
