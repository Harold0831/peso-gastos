import Link from "next/link";
import type { Transaction } from "@/lib/types";
import { formatSignedMoney, formatTime, merchantColor, merchantInitials } from "@/lib/format";

export function TxRow({ tx, divider }: { tx: Transaction; divider: boolean }) {
  const category = tx.category ?? tx.ai_suggested_category ?? "Sin categoría";
  return (
    <Link
      href={`/transactions/${tx.id}`}
      className={`flex items-center gap-3 px-4 py-3.5 transition active:bg-background ${
        divider ? "border-b border-line" : ""
      }`}
    >
      <div
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-pill"
        style={{ backgroundColor: merchantColor(tx.merchant) }}
      >
        <span className="text-xs font-bold text-[#3a3a44]">{merchantInitials(tx.merchant)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold tracking-tight text-ink">
            {tx.merchant}
          </span>
          {!tx.confirmed && (
            <span className="shrink-0 rounded-[4px] bg-warning/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-warning">
              PENDIENTE
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-muted">
          {category} · {formatTime(new Date(tx.date))}
        </div>
      </div>
      <span
        className={`text-sm font-bold tracking-tight ${
          tx.type === "income" ? "text-income" : "text-ink"
        }`}
      >
        {formatSignedMoney(tx.amount, tx.type)}
      </span>
    </Link>
  );
}
