"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, HomeIcon, ListIcon, MoreIcon, PlusIcon } from "./icons";

// Cuatro destinos + el FAB es lo que cabe cómodo. Las pantallas de gestión
// (Presupuesto, Gastos fijos, Metas, Categorías, Perfil) viven todas bajo
// "Más" en vez de repartidas entre el nav y tarjetas del dashboard.
// Presupuesto sale del nav porque además se llega a él desde la push de
// "80% del presupuesto"; Gráficas no tiene otra puerta de entrada.
const items = [
  { href: "/", label: "Inicio", icon: HomeIcon },
  { href: "/transactions", label: "Transacciones", icon: ListIcon },
  { href: "/charts", label: "Gráficas", icon: ChartIcon },
  { href: "/more", label: "Más", icon: MoreIcon },
] as const;

/** Rutas que cuelgan de "Más": estando en cualquiera de ellas, esa pestaña
 *  se marca activa (patrón estándar de la pestaña "Más"). */
const MORE_ROUTES = ["/more", "/budget", "/goals", "/recurring", "/categories", "/profile"];

/** Opacidad reducida mientras Next resuelve la navegación — feedback inmediato al tocar. */
function NavLinkContent({
  icon: Icon,
  label,
}: {
  icon: (typeof items)[number]["icon"];
  label: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`flex flex-col items-center gap-[3px] transition-opacity ${pending ? "opacity-40" : ""}`}
    >
      <Icon />
      <span className="text-[10px] font-medium tracking-tight">{label}</span>
    </span>
  );
}

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/more") return MORE_ROUTES.some((route) => pathname.startsWith(route));
    return pathname.startsWith(href);
  };

  const left = items.slice(0, 2);
  const right = items.slice(2);

  const renderItem = ({ href, label, icon: Icon }: (typeof items)[number]) => (
    <Link
      key={href}
      href={href}
      className={`flex w-[64px] flex-col items-center px-1 py-1 ${
        isActive(href) ? "text-accent" : "text-ink-muted"
      }`}
    >
      <NavLinkContent icon={Icon} label={label} />
    </Link>
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-safe">
      <div className="mx-auto flex max-w-lg items-center justify-around pb-2 pt-2.5">
        {left.map(renderItem)}
        <Link
          href="/transactions/new"
          aria-label="Agregar transacción"
          className="-translate-y-2 rounded-pill bg-accent p-0 shadow-[0_4px_12px_rgba(37,99,235,0.35)] transition active:scale-95"
        >
          <span className="flex h-10 w-14 items-center justify-center text-white">
            <PlusIcon />
          </span>
        </Link>
        {right.map(renderItem)}
      </div>
    </nav>
  );
}
