import Link from "next/link";
import type { Transaction } from "@/lib/types";
import { formatSignedMoney, formatTime, merchantColor, merchantInitials } from "@/lib/format";

interface TxRowProps {
  tx: Transaction;
  divider: boolean;
  /** Modo selección múltiple (confirmar varias a la vez): la fila deja de
   *  navegar y en su lugar togglea un checkbox. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function TxRow({ tx, divider, selectable, selected, onToggleSelect }: TxRowProps) {
  const category = tx.category ?? tx.ai_suggested_category ?? "Sin categoría";
  const rowClass = `flex items-center gap-3 px-4 py-3.5 text-left transition active:bg-background ${
    divider ? "border-b border-line" : ""
  }`;

  const content = (
    <>
      {selectable && (
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-pill border-2 transition ${
            selected ? "border-accent bg-accent" : "border-line bg-surface"
          }`}
        >
          {selected && (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
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
        {formatSignedMoney(tx.amount, tx.type, tx.currency)}
      </span>
    </>
  );

  if (selectable) {
    return (
      <button type="button" onClick={onToggleSelect} className={`w-full ${rowClass}`}>
        {content}
      </button>
    );
  }

  return (
    <Link href={`/transactions/${tx.id}`} className={rowClass}>
      {content}
    </Link>
  );
}
