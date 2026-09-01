import type { Transaction } from "./types";

/**
 * Exportación de transacciones a CSV.
 *
 * Existe porque los datos de un usuario solo viven en la base de datos de
 * quien despliega la instancia: sin una forma de sacarlos, un borrado
 * accidental o el cierre del proyecto se lleva años de historial. Además es
 * lo que la política de privacidad promete al hablar de acceder a tus datos.
 */

/**
 * Escapa un valor para CSV según RFC 4180: se entrecomilla si contiene coma,
 * comilla, salto de línea o espacios en los extremos, y las comillas de
 * dentro se duplican.
 *
 * No es un detalle menor aquí: los nombres de comercio traen comas con
 * frecuencia ("SUPERMERCADO NACIONAL, S.A.") y las notas las escribe el
 * usuario, así que pueden traer cualquier cosa. Sin esto, una sola coma
 * desplaza todas las columnas de esa fila.
 */
export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";
  const needsQuotes = /[",\n\r]/.test(text) || text !== text.trim();
  if (!needsQuotes) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Timestamp ISO → "YYYY-MM-DD HH:MM" en hora de RD (AST = UTC-4 fijo).
 *
 * Ni el ISO crudo ni la hora del servidor sirven aquí: el ISO en UTC (…Z)
 * Excel no lo reconoce como fecha y además muestra una hora que no es la que
 * el usuario vivió, y el servidor corre en UTC en Vercel. Este formato sí lo
 * parsea Excel y Sheets, y coincide con lo que se ve en la app.
 */
export function formatCsvDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ast = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${ast.getUTCFullYear()}-${pad(ast.getUTCMonth() + 1)}-${pad(ast.getUTCDate())}` +
    ` ${pad(ast.getUTCHours())}:${pad(ast.getUTCMinutes())}`
  );
}

/** Cabeceras en español: el archivo lo abre una persona, no un programa. */
const COLUMNS: { header: string; value: (t: Transaction) => string | number | null }[] = [
  { header: "Fecha (AST)", value: (t) => formatCsvDate(t.date) },
  { header: "Tipo", value: (t) => (t.type === "income" ? "Ingreso" : "Gasto") },
  { header: "Comercio", value: (t) => t.merchant },
  { header: "Monto", value: (t) => t.amount.toFixed(2) },
  { header: "Moneda", value: (t) => t.currency },
  { header: "Tasa de cambio", value: (t) => (t.exchange_rate === null ? "" : t.exchange_rate) },
  { header: "Categoría", value: (t) => t.category ?? t.ai_suggested_category },
  { header: "Confirmada", value: (t) => (t.confirmed ? "Sí" : "No") },
  { header: "Tarjeta", value: (t) => t.card_last4 },
  { header: "Origen", value: (t) => SOURCE_LABELS[t.source ?? ""] ?? "" },
  { header: "Notas", value: (t) => t.notes },
];

const SOURCE_LABELS: Record<string, string> = {
  email: "Correo",
  manual: "Manual",
  voice: "Voz",
};

/**
 * CSV completo de un listado de transacciones.
 *
 * Va con **BOM** al principio: sin él, Excel en Windows abre el archivo como
 * ANSI y destroza cualquier acento ("Alimentación" → "AlimentaciÃ³n"). El
 * separador de línea es CRLF, también por RFC 4180 y por Excel.
 */
export function transactionsToCsv(transactions: Transaction[]): string {
  const header = COLUMNS.map((c) => escapeCsvValue(c.header)).join(",");
  const rows = transactions.map((t) => COLUMNS.map((c) => escapeCsvValue(c.value(t))).join(","));
  return "﻿" + [header, ...rows].join("\r\n") + "\r\n";
}

/** Nombre sugerido del archivo, con la fecha de descarga. */
export function csvFilename(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `peso-transacciones-${stamp}.csv`;
}
