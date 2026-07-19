import Link from "next/link";
import { subMonths } from "date-fns";
import {
  getGoals,
  getHomeCurrency,
  getMonthSummary,
  getPendingCount,
  getTransactions,
} from "@/lib/data";
import { currencySymbol, formatMoney, formatMonthLabel, merchantInitials } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getGmailStatus, getUserById, requireUserId, type GmailStatus } from "@/lib/users";
import { getCredentialsForUser } from "@/lib/webauthn";
import { Donut } from "@/components/donut";
import { Dismissible } from "@/components/dismissible";
import { OnboardingCard } from "@/components/onboarding-card";
import { TxRow } from "@/components/tx-row";
import { BellIcon, ChevronIcon, TargetIcon } from "@/components/icons";

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
  let gmail: GmailStatus = { linked: true, email: null, syncEnabled: true, enabledBanks: null };
  let hasPasskey = true; // en demo no se muestra el banner de Face ID
  if (isSupabaseConfigured()) {
    const userId = await requireUserId();
    const [user, gmailStatus, credentials] = await Promise.all([
      getUserById(userId),
      getGmailStatus(userId),
      getCredentialsForUser(userId),
    ]);
    displayName = user?.name?.split(" ")[0] ?? user?.email ?? "Usuario";
    gmail = gmailStatus;
    hasPasskey = credentials.length > 0;
  }

  const [summary, prevSummary, pendingCount, recent, goals, homeCurrency] = await Promise.all([
    getMonthSummary(now),
    getMonthSummary(subMonths(now, 1)),
    getPendingCount(),
    getTransactions({ limit: 5 }),
    getGoals(),
    getHomeCurrency(),
  ]);

  // Comparación de gastos vs el mes anterior — el "ajá" de una app de
  // finanzas está en el delta, no en el número absoluto.
  const expenseDelta =
    prevSummary.expenses > 0 && summary.expenses > 0
      ? Math.round(((summary.expenses - prevSummary.expenses) / prevSummary.expenses) * 100)
      : null;

  // Presupuesto ahora vive en la barra de navegación; esta tarjeta da el
  // acceso a Metas (la pantalla que salió del nav por ser de uso esporádico).
  const activeGoals = goals.filter((g) => g.current_amount < g.target_amount).length;

  // Usuario recién llegado: sin transacciones aún. La guía de primeros
  // pasos reemplaza a los banners sueltos hasta el primer movimiento.
  const isNewUser = recent.length === 0;

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
            {summary.net < 0 ? "−" : ""}
            {currencySymbol(homeCurrency)}
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
                +{formatMoney(summary.income, homeCurrency)}
              </div>
            </div>
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-btn bg-background px-3 py-2.5">
            <span className="h-1.5 w-1.5 rounded-pill bg-expense" />
            <div>
              <div className="text-[10px] font-medium text-ink-muted">Gastos</div>
              <div className="text-[13px] font-bold tracking-tight text-expense">
                −{formatMoney(summary.expenses, homeCurrency)}
              </div>
              {expenseDelta !== null && (
                <div
                  className={`text-[10px] font-bold ${
                    expenseDelta > 0 ? "text-expense" : "text-income"
                  }`}
                >
                  {expenseDelta > 0 ? "▲" : "▼"} {Math.abs(expenseDelta)}% vs mes pasado
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Guía de primeros pasos (solo sin transacciones) */}
      {isNewUser && <OnboardingCard gmailLinked={gmail.linked && gmail.syncEnabled} />}

      {/* Reconectar Gmail — NO descartable: es una rotura real del sync */}
      {!isNewUser && gmail.linked && !gmail.syncEnabled && (
        <Link
          href="/profile"
          className="mt-3.5 flex items-center gap-3 rounded-[14px] border border-warning/40 bg-warning/10 px-4 py-3"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-warning/10 text-base">
            ✉️
          </span>
          <span className="flex-1">
            <span className="block text-[13px] font-semibold text-ink">
              El acceso a tu Gmail expiró
            </span>
            <span className="block text-[11px] text-ink-muted">
              Reconéctalo para que el sync siga funcionando · Toca aquí
            </span>
          </span>
          <ChevronIcon className="text-ink-muted" />
        </Link>
      )}

      {/* Vincular Gmail — descartable: usar la app 100% manual es válido */}
      {!isNewUser && !gmail.linked && (
        <Dismissible storageKey="peso-banner-gmail" className="mt-3.5">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-[14px] border border-accent/30 bg-accent/5 px-4 py-3 pr-10"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-accent/10 text-base">
              ✉️
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-semibold text-ink">
                Vincula tu Gmail para importar transacciones
              </span>
              <span className="block text-[11px] text-ink-muted">
                Peso solo lee las notificaciones de tus bancos · Toca para configurar
              </span>
            </span>
            <ChevronIcon className="text-ink-muted" />
          </Link>
        </Dismissible>
      )}

      {/* Activar Face ID — descartable: es opcional y la opción vive en el perfil */}
      {gmail.linked && gmail.syncEnabled && !hasPasskey && (
        <Dismissible storageKey="peso-banner-faceid" className="mt-3.5">
          <Link
            href="/profile"
            className="flex items-center gap-3 rounded-[14px] border border-accent/30 bg-accent/5 px-4 py-3 pr-10"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-accent/10 text-base">
              🔒
            </span>
            <span className="flex-1">
              <span className="block text-[13px] font-semibold text-ink">
                Protege tu app con Face ID
              </span>
              <span className="block text-[11px] text-ink-muted">
                Pide tu identidad al abrir la app · Actívalo en tu perfil
              </span>
            </span>
            <ChevronIcon className="text-ink-muted" />
          </Link>
        </Dismissible>
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

      {/* Acceso a metas de ahorro */}
      <Link
        href="/goals"
        className="mt-3.5 flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-background text-ink">
          <TargetIcon size={18} />
        </span>
        <span className="flex-1">
          <span className="block text-[13px] font-semibold text-ink">Metas de ahorro</span>
          <span className="block text-[11px] text-ink-muted">
            {goals.length === 0
              ? "Crea tu primera meta"
              : activeGoals === 0
                ? "🎉 Todas tus metas completadas"
                : `${activeGoals} ${activeGoals === 1 ? "meta activa" : "metas activas"}`}
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
            Sin transacciones todavía. Llegarán solas desde tu correo, o crea una con el botón +.
          </p>
        ) : (
          recent.map((tx, i) => <TxRow key={tx.id} tx={tx} divider={i < recent.length - 1} />)
        )}
      </section>
    </main>
  );
}
