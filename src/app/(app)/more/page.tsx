import Link from "next/link";
import { getCards, getGoals, getRecurringForMonth } from "@/lib/data";
import {
  ChevronIcon,
  CreditCardIcon,
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
 *
 * Va en DOS grupos con título en vez de una lista corrida: seis filas
 * idénticas en un bloque continuo se leían como un muro sin jerarquía, y
 * encima sobraba media pantalla vacía. Mismo patrón de secciones que
 * /categories.
 */
export default async function MorePage() {
  const now = new Date();
  const [recurring, goals, cards] = await Promise.all([
    getRecurringForMonth(now),
    getGoals(),
    getCards(),
  ]);

  const recurringPaid = recurring.filter((r) => r.status === "paid").length;
  const activeGoals = goals.filter((g) => g.current_amount < g.target_amount).length;

  const groups = [
    {
      title: "Tu dinero",
      items: [
        {
          href: "/cards",
          icon: CreditCardIcon,
          label: "Tarjetas",
          detail:
            cards.length === 0
              ? "Mira cuánto gastas con cada tarjeta"
              : `${cards.length} ${cards.length === 1 ? "tarjeta" : "tarjetas"} · gasto por tarjeta`,
        },
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
      ],
    },
    {
      title: "Ajustes",
      items: [
        {
          href: "/categories",
          icon: TagIcon,
          label: "Categorías",
          detail: "Crea las tuyas y elimina las que no usas",
        },
        {
          href: "/profile",
          icon: UserIcon,
          label: "Perfil",
          detail: "Gmail, bancos, Face ID y notificaciones",
        },
      ],
    },
  ];

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Más</h1>
      </div>

      {groups.map(({ title, items }) => (
        <section key={title} className="mx-5 mb-5">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {title}
          </h2>
          <div className="overflow-hidden rounded-card border border-line bg-card">
            {items.map(({ href, icon: Icon, label, detail }, i) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3.5 px-4 py-4 transition active:bg-background ${
                  i < items.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-background text-ink">
                  <Icon size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{label}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{detail}</span>
                </span>
                <ChevronIcon className="shrink-0 text-ink-muted" />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
