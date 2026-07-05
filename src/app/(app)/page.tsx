import Link from "next/link";
import { getBudgetsForMonth, getMonthSummary, getPendingCount, getTransactions } from "@/lib/data";
import { formatMoney, formatMonthLabel, merchantInitials } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getGmailStatus, getUserById, requireUserId, type GmailStatus } from "@/lib/users";
import { Donut } from "@/components/donut";
import { TxRow } from "@/components/tx-row";
import { BellIcon, ChevronIcon, WalletIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Santo_Domingo",
    }).format(new Date()),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default async function DashboardPage() {
  const now = new Date();

  let displayName = "Demo";
  let gmail: GmailStatus = { linked: true, email: null, syncEnabled: true };
  if (isSupabaseConfigured()) {
    const userId = await requireUserId();
    const [user, gmailStatus] = await Promise.all([getUserById(userId), getGmailStatus(userId)]);
    displayName = user?.name?.split(" ")[0] ?? user?.email ?? "Usuario";
    gmail = gmailStatus;
  }

  const [summary, pendingCount, recent, budgets] = await Promise.all([
    getMonthSummary(now),
    getPendingCount(),
    getTransactions({ limit: 5 }),
    getBudgetsForMonth(now),
  ]);

  const totalBudget = budgets.reduce((s, b) => s + b.budget.limit_amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const budgetPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null;

  return (
    <main className="px-5 pt-safe">
      {/* Top bar */}
      <div className="flex items-center justify-between py-4">
        <Link href="/profile" className="flex items-center gap-3">
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-pill bg-accent text-sm font-semibold tracking-wide text-white">
            {merchantInitials(displayName)}
          </span>
          <span>
            <span className="block text-[11px] font-medium text-ink-muted">{greeting()}</span>
            <span className="block text-[17px] font-bold tracking-tight text-ink">
              Hola, {displayName}
            </span>
          </span>
        </Link>
        <Link
          href="/transactions?filter=pendientes"
          aria-label="Transacciones por confirmar"
          className="relative flex h-[38px] w-[38px] items-center justify-center rounded-pill border border-line bg-surface text-ink"
        >
          <BellIcon />
          {pendingCount > 0 && (
            <span className="absolute right-2.5 top-2 h-[7px] w-[7px] rounded-pill border-[1.5px] border-surface bg-expense" />
          )}
        </Link>
      </div>

      {/* Balance card */}
      <section className="rounded-card border border-line bg-card p-6 shadow-card">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Balance de {formatMonthLabel(now).toLowerCase()}
          </span>
          <Donut income={summary.income} expenses={summary.expenses} />
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-ink-muted">
            {summary.net < 0 ? "−RD$" : "RD$"}
          </span>
          <span
            className={`text-[38px] font-extrabold leading-none tracking-tighter ${
              summary.net < 0 ? "text-expense" : "text-ink"
            }`}
          >
            {Math.abs(summary.net).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="mt-5 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-btn bg-background px-3 py-2.5">
            <span className="h-1.5 w-1.5 rounded-pill bg-income" />
            <div>
              <div className="text-[10px] font-medium text-ink-muted">Ingresos</div>
              <div className="text-[13px] font-bold tracking-tight text-income">
                +{formatMoney(summary.income)}
              </div>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-btn bg-background px-3 py-2.5">
            <span className="h-1.5 w-1.5 rounded-pill bg-expense" />
            <div>
              <div className="text-[10px] font-medium text-ink-muted">Gastos</div>
              <div className="text-[13px] font-bold tracking-tight text-expense">
                −{formatMoney(summary.expenses)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vincular/reconectar Gmail */}
      {(!gmail.linked || !gmail.syncEnabled) && (
        <Link
          href="/profile"
          className="mt-3.5 flex items-center gap-3 rounded-[14px] border border-accent/30 bg-accent/5 px-4 py-3"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-accent/10 text-base">
            ✉️
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-semibold text-ink">
              {gmail.linked
                ? "El acceso a tu Gmail expiró"
                : "Vincula tu Gmail para importar transacciones"}
            </span>
            <span className="block text-[11px] text-ink-muted">
              {gmail.linked
                ? "Reconéctalo para que el sync siga funcionando · Toca aquí"
                : "Peso registra solo tus movimientos de Qik · Toca para configurar"}
            </span>
          </span>
          <ChevronIcon className="text-ink-muted" />
        </Link>
      )}

      {/* Pendientes */}
      {pendingCount > 0 && (
        <Link
          href="/transactions?filter=pendientes"
          className="mt-3.5 flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-accent/10 text-[13px] font-bold text-accent">
            {pendingCount}
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-semibold text-ink">
              {pendingCount === 1
                ? "1 transacción por confirmar"
                : `${pendingCount} transacciones por confirmar`}
            </span>
            <span className="block text-[11px] text-ink-muted">
              Importadas desde Gmail · Toca para revisar
            </span>
          </span>
          <ChevronIcon className="text-ink-muted" />
        </Link>
      )}

      {/* Acceso a presupuesto */}
      <Link
        href="/budget"
        className="mt-3.5 flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-background text-ink">
          <WalletIcon size={18} />
        </span>
        <span className="flex-1">
          <span className="block text-[13px] font-semibold text-ink">Presupuesto del mes</span>
          <span className="block text-[11px] text-ink-muted">
            {budgetPct === null ? "Aún sin presupuestos" : `${budgetPct}% utilizado`}
          </span>
        </span>
        <ChevronIcon className="text-ink-muted" />
      </Link>

      {/* Recientes */}
      <div className="flex items-center justify-between pb-2.5 pt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink">
          Transacciones recientes
        </h2>
        <Link href="/transactions" className="text-[13px] font-semibold text-accent">
          Ver todas →
        </Link>
      </div>
      <section className="overflow-hidden rounded-card border border-line bg-card">
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Sin transacciones todavía. Se importarán solas desde Gmail.
          </p>
        ) : (
          recent.map((tx, i) => <TxRow key={tx.id} tx={tx} divider={i < recent.length - 1} />)
        )}
      </section>
    </main>
  );
}
