"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { copyBudgetsFromPreviousMonth } from "@/lib/actions";
import { useToast } from "@/components/toast";

/** Un tap para arrancar el mes con los mismos presupuestos del anterior. */
export function CopyBudgetsButton({ month, prevLabel }: { month: string; prevLabel: string }) {
  const router = useRouter();
  const toast = useToast();
  const [copying, startCopying] = useTransition();

  return (
    <button
      onClick={() =>
        startCopying(async () => {
          const result = await copyBudgetsFromPreviousMonth(month);
          if (!result.ok) {
            toast(result.error ?? "No se pudo copiar", "error");
            return;
          }
          toast(`✓ Presupuestos de ${prevLabel} copiados`);
          router.refresh();
        })
      }
      disabled={copying}
      className="mt-1.5 rounded-[14px] border border-accent/30 bg-accent/5 py-3.5 text-[13px] font-bold text-accent disabled:opacity-50"
    >
      {copying ? "Copiando…" : `⧉ Copiar presupuestos de ${prevLabel}`}
    </button>
  );
}
