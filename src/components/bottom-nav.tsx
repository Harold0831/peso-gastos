"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, HomeIcon, ListIcon, PlusIcon, TargetIcon } from "./icons";

const items = [
  { href: "/", label: "Inicio", icon: HomeIcon },
  { href: "/transactions", label: "Transacciones", icon: ListIcon },
  { href: "/charts", label: "Gráficas", icon: ChartIcon },
  { href: "/goals", label: "Metas", icon: TargetIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const left = items.slice(0, 2);
  const right = items.slice(2);

  const renderItem = ({ href, label, icon: Icon }: (typeof items)[number]) => (
    <Link
      key={href}
      href={href}
      className={`flex w-[64px] flex-col items-center gap-[3px] px-1 py-1 ${
        isActive(href) ? "text-accent" : "text-ink-muted"
      }`}
    >
      <Icon />
      <span className="text-[10px] font-medium tracking-tight">{label}</span>
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
