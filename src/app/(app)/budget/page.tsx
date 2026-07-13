import { getBudgetsForMonth, getCategories, getHomeCurrency } from "@/lib/data";
import { formatMoney, formatMonthLabel } from "@/lib/format";
import { AddBudgetForm } from "./add-budget-form";

export const dynamic = "force-dynamic";

function barColor(pct: number): string {
  if (pct >= 0.9) return "var(--expense)";
  if (pct >= 0.7) return "var(--warning)";
  return "var(--accent)";
}

export default async function BudgetPage() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const [budgets, categories, homeCurrency] = await Promise.all([
    getBudgetsForMonth(now),
    getCategories(),
    getHomeCurrency(),
  ]);

  const totalUsed = budgets.reduce((s, b) => s + b.spent, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.budget.limit_amount, 0);
  const overallPct = totalBudget > 0 ? totalUsed / totalBudget : 0;
  const overspent = budgets.filter((b) => b.spent / b.budget.limit_amount > 0.8);
  const available = categories.filter((c) => !budgets.some((b) => b.category.id === c.id));

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Presupuesto</h1>
        <p className="mt-1 text-[13px] font-medium text-ink-muted">{formatMonthLabel(now)}</p>
      </div>

      {/* Total */}
      {budgets.length > 0 && (
        <section className="mx-5 mb-4 rounded-card border border-line bg-card p-5">
          <div className="mb-3.5 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Total utilizado
            </span>
            <span className="text-2xl font-extrabold tracking-tight text-ink">
              {Math.round(overallPct * 100)}%
            </span>
          </div>
          <div className="mb-2.5 h-2 overflow-hidden rounded-pill bg-background">
            <div
              className="h-full rounded-pill transition-[width]"
              style={{
                width: `${Math.min(overallPct, 1) * 100}%`,
                backgroundColor: barColor(overallPct),
              }}
            />
          </div>
          <div className="flex justify-between text-xs font-medium text-ink-muted">
            <span className="font-semibold text-ink">{formatMoney(totalUsed, homeCurrency)}</span>
            <span>de {formatMoney(totalBudget, homeCurrency)}</span>
          </div>
        </section>
      )}

      {/* Alerta */}
      {overspent.length > 0 && (
        <div className="mx-5 mb-4 flex items-start gap-2.5 rounded-[14px] border border-warning/30 bg-warning/10 px-4 py-3">
          <span aria-hidden>⚠️</span>
          <p className="text-[13px] font-medium text-ink">
            {overspent.length === 1
              ? `${overspent[0].category.name} superó el 80% del presupuesto.`
              : `${overspent.map((b) => b.category.name).join(", ")} superaron el 80% del presupuesto.`}
          </p>
        </div>
      )}

      {/* Cards por categoría */}
      <div className="flex flex-col gap-2.5 px-5">
        {budgets.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-muted">
            Sin presupuestos este mes. Crea el primero abajo.
          </p>
        )}
        {budgets.map(({ budget, category, spent }) => {
          const pct = spent / budget.limit_amount;
          return (
            <div
              key={budget.id}
              className="rounded-[14px] border border-line bg-card p-4 shadow-card"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-background text-sm">
                    {category.icon}
                  </span>
                  <span className="text-sm font-bold tracking-tight text-ink">{category.name}</span>
                </div>
                <span
                  className="text-xs font-bold tracking-tight"
                  style={{ color: pct >= 0.7 ? barColor(pct) : "var(--text-secondary)" }}
                >
                  {Math.round(pct * 100)}%
                </span>
              </div>
              <div className="mb-2 h-1.5 overflow-hidden rounded-pill bg-background">
                <div
                  className="h-full rounded-pill"
                  style={{
                    width: `${Math.min(pct, 1) * 100}%`,
                    backgroundColor: barColor(pct),
                  }}
                />
              </div>
              <p className="text-[11px] font-medium text-ink-muted">
                <span className="font-semibold text-ink">{formatMoney(spent, homeCurrency)}</span>{" "}
                usado de {formatMoney(budget.limit_amount, homeCurrency)}
              </p>
            </div>
          );
        })}

        <AddBudgetForm
          month={monthKey}
          categories={available.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
          currency={homeCurrency}
        />
      </div>
    </main>
  );
}
