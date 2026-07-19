import Link from "next/link";
import { getAttentionItems } from "@/lib/data";
import { BackIcon, ChevronIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * Bandeja de notificaciones (la campanita del dashboard): todo lo que
 * requiere atención en un solo lugar — Gmail roto, presupuestos en riesgo
 * y transacciones por confirmar. Derivada del estado actual (ver
 * getAttentionItems): lo resuelto desaparece solo, sin "marcar leído".
 */
export default async function NotificationsPage() {
  const items = await getAttentionItems();

  return (
    <main className="pt-safe">
      <div className="flex items-center px-4 py-2">
        <Link href="/" aria-label="Volver al inicio" className="p-2 text-ink">
          <BackIcon />
        </Link>
        <h1 className="flex-1 text-center text-[15px] font-semibold tracking-tight text-ink">
          Notificaciones
        </h1>
        <span className="w-[38px]" />
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-20 text-center">
          <p className="text-3xl">🔔</p>
          <p className="mt-3 text-sm font-semibold text-ink">Todo al día</p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Aquí verás transacciones por confirmar y avisos de tus presupuestos.
          </p>
        </div>
      ) : (
        <div className="mx-5 mt-2 overflow-hidden rounded-card border border-line bg-card">
          {items.map((item, i) => (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3.5 transition active:bg-background ${
                i < items.length - 1 ? "border-b border-line" : ""
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill text-base ${
                  item.kind === "pending" ? "bg-accent/10" : "bg-warning/10"
                }`}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {item.title}
                </span>
                <span className="block text-[11px] text-ink-muted">{item.detail}</span>
              </span>
              <ChevronIcon className="shrink-0 text-ink-muted" />
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
