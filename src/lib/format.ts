import { format, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import type { Currency } from "./types";

/** Prefijo visual por moneda. */
export function currencySymbol(currency: Currency = "DOP"): string {
  if (currency === "USD") return "US$";
  if (currency === "EUR") return "€";
  return "RD$";
}

/** Formatea montos como "RD$ 1,234.56" o "US$ 11.99" según la moneda. */
export function formatMoney(amount: number, currency: Currency = "DOP"): string {
  return (
    currencySymbol(currency) +
    " " +
    Math.abs(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Monto con signo para listas: "+RD$ 100.00" / "−US$ 11.99". */
export function formatSignedMoney(
  amount: number,
  type: "expense" | "income",
  currency: Currency = "DOP",
): string {
  return (type === "income" ? "+" : "−") + formatMoney(amount, currency);
}

/** Encabezados de grupo de fecha: "Hoy", "Ayer", "Lun 4 may". */
export function formatDayLabel(date: Date): string {
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  const label = format(date, "EEE d MMM", { locale: es });
  // date-fns devuelve "lun." — normaliza a "Lun 4 may"
  return label.replace(/\./g, "").replace(/^./, (c) => c.toUpperCase());
}

export function formatTime(date: Date): string {
  return format(date, "hh:mm a");
}

export function formatFullDate(date: Date): string {
  return format(date, "d 'de' MMMM, yyyy", { locale: es });
}

/** "Mayo 2026" para selectores de mes. */
export function formatMonthLabel(date: Date): string {
  const label = format(date, "MMMM yyyy", { locale: es });
  return label.replace(/^./, (c) => c.toUpperCase());
}

/** Iniciales de un comercio: "Supermercado Nacional" → "SN". */
export function merchantInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Cuántos tintes de avatar hay definidos (.avatar-tint-N en globals.css). */
export const AVATAR_TINTS = 7;

/**
 * Tinte determinístico (0..AVATAR_TINTS-1) para el avatar de un comercio.
 *
 * Devuelve un ÍNDICE y no un color: el hex tendría que ser el mismo en los
 * dos temas, y los pasteles claros del tema claro se ven como manchas
 * brillantes sobre fondo oscuro. Con el índice, el color real lo pone
 * `.avatar-tint-N` en globals.css y cambia con el tema.
 */
export function merchantTint(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % AVATAR_TINTS;
}
