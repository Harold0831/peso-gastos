import Link from "next/link";
import { getGoals, getRecurringForMonth } from "@/lib/data";
import {
  ChevronIcon,
  RefreshIcon,
  TagIcon,
  TargetIcon,
  UserIcon,
  WalletIcon,
} from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Pantalla "Más": un solo lugar para todo lo de gestión. Antes estas
 * pantallas estaban repartidas entre el nav (Presupuesto), tarjetas del
 * dashboard (Gastos fijos, Metas) y el perfil (Categorías) — inconsistente y
 * ruidoso. Cada fila muestra su estado real para que el menú informe, no
 * solo enlace.
 */
export default async function MorePage() {
  const now = new Date();
  const [recurring, goals] = await Promise.all([getRecurringForMonth(now), getGoals()]);

  const recurringPaid = recurring.filter((r) => r.status === "paid").length;
  const activeGoals = goals.filter((g) => g.current_amount < g.target_amount).length;

  const items = [
    {
      href: "/budget",
      icon: WalletIcon,
      label: "Presupuesto",
      detail: "Límites de gasto por categoría",
    },
    {
      href: "/recurring",
      icon: RefreshIcon,
      label: "Gastos fijos",
      detail:
        recurring.length === 0
          ? "Registra tus pagos recurrentes"
          : recurringPaid === recurring.length
            ? "Todos pagados este mes"
            : `${recurringPaid} de ${recurring.length} pagados este mes`,
    },
    {
      href: "/goals",
      icon: TargetIcon,
      label: "Metas de ahorro",
      detail:
        goals.length === 0
          ? "Crea tu primera meta"
          : activeGoals === 0
            ? "Todas tus metas completadas"
            : `${activeGoals} ${activeGoals === 1 ? "meta activa" : "metas activas"}`,
    },
    {
      href: "/categories",
      icon: TagIcon,
      label: "Categorías",
      detail: "Crea las tuyas y oculta las que no usas",
    },
    {
      href: "/profile",
      icon: UserIcon,
      label: "Perfil",
      detail: "Gmail, bancos, Face ID y notificaciones",
    },
  ];

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Más</h1>
      </div>

      <section className="mx-5 overflow-hidden rounded-card border border-line bg-card">
        {items.map(({ href, icon: Icon, label, detail }, i) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-4 py-3.5 transition active:bg-background ${
              i < items.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-pill bg-background text-ink">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-ink">{label}</span>
              <span className="block truncate text-[11px] text-ink-muted">{detail}</span>
            </span>
            <ChevronIcon className="shrink-0 text-ink-muted" />
          </Link>
        ))}
      </section>
    </main>
  );
}
