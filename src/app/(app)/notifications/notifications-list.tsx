"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AttentionItem } from "@/lib/data";
import { dismissNotifications } from "@/lib/actions";
import {
  AlertIcon,
  BellIcon,
  ChevronIcon,
  ClockIcon,
  CloseIcon,
  MailIcon,
} from "@/components/icons";
import { useToast } from "@/components/toast";

export function NotificationsList({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startDismiss] = useTransition();

  const dismissibles = items.filter((i) => i.dismissible);

  const dismiss = (entries: { id: string; context?: string }[], message: string) => {
    startDismiss(async () => {
      const result = await dismissNotifications({ entries });
      if (!result.ok) {
        toast(result.error ?? "No se pudo descartar", "error");
        return;
      }
      toast(message);
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <div className="px-5 py-20 text-center">
        <BellIcon size={34} className="mx-auto text-ink-muted" />
        <p className="mt-3 text-sm font-semibold text-ink">Todo al día</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Aquí verás transacciones por confirmar y avisos de tus presupuestos.
        </p>
      </div>
    );
  }

  return (
    <>
      {dismissibles.length > 0 && (
        <div className="flex justify-end px-5 pb-2">
          <button
            onClick={() =>
              dismiss(
                dismissibles.map(({ id, context }) => ({ id, context })),
                "Notificaciones descartadas",
              )
            }
            disabled={busy}
            className="text-[13px] font-semibold text-ink-muted disabled:opacity-50"
          >
            Limpiar todo
          </button>
        </div>
      )}
      <div className="mx-5 overflow-hidden rounded-card border border-line bg-card">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={`flex items-center gap-2 pr-2 ${
              i < items.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <Link
              href={item.href}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 transition active:bg-background"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-pill ${
                  item.kind === "pending"
                    ? "bg-accent/10 text-accent"
                    : "bg-warning/10 text-warning"
                }`}
              >
                {item.kind === "gmail" ? (
                  <MailIcon size={18} />
                ) : item.kind === "pending" ? (
                  <ClockIcon size={18} />
                ) : (
                  <AlertIcon size={18} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-ink">
                  {item.title}
                </span>
                <span className="block text-[11px] text-ink-muted">{item.detail}</span>
              </span>
              <ChevronIcon className="shrink-0 text-ink-muted" />
            </Link>
            {item.dismissible && (
              <button
                aria-label={`Descartar: ${item.title}`}
                onClick={() =>
                  dismiss([{ id: item.id, context: item.context }], "Notificación descartada")
                }
                disabled={busy}
                // 44px de área táctil (el mínimo de las guías de Apple) sin
                // robarle 44px de ancho al título: el margen negativo mete el
                // botón dentro del `pr-2` de la fila, así que crece la zona
                // que se puede tocar, no el hueco que ocupa.
                className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-muted disabled:opacity-50"
              >
                <CloseIcon size={17} />
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="px-5 pt-3 text-center text-[11px] leading-relaxed text-ink-muted">
        Un aviso descartado vuelve si hay algo nuevo (otra transacción pendiente, un presupuesto que
        empeora).
      </p>
    </>
  );
}
