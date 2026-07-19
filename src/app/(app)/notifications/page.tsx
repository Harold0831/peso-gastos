import Link from "next/link";
import { getAttentionItems } from "@/lib/data";
import { BackIcon } from "@/components/icons";
import { NotificationsList } from "./notifications-list";

export const dynamic = "force-dynamic";

/**
 * Bandeja de notificaciones (la campanita del dashboard): todo lo que
 * requiere atención en un solo lugar — Gmail roto, pendientes agrupadas
 * en un aviso, y presupuestos en riesgo. Derivada del estado actual (ver
 * getAttentionItems); los avisos descartados vuelven solo con info nueva.
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
      <div className="pt-2">
        <NotificationsList items={items} />
      </div>
    </main>
  );
}
