/**
 * Catálogo de bancos soportados, separado de bank-parser.ts a propósito:
 * este módulo es seguro para el cliente (UI del perfil, schemas Zod),
 * mientras que bank-parser.ts arrastra los 5 parsers y es solo servidor.
 * Los ids se guardan en gmail_accounts.enabled_banks — no renombrar.
 */
export const SUPPORTED_BANKS = [
  { id: "qik", name: "Qik" },
  { id: "popular", name: "Banco Popular" },
  { id: "caribe", name: "Banco Caribe" },
  { id: "scotiabank", name: "Scotiabank" },
  { id: "bhd", name: "BHD" },
  { id: "banreservas", name: "Banreservas" },
] as const;

export type BankId = (typeof SUPPORTED_BANKS)[number]["id"];

export const BANK_IDS = SUPPORTED_BANKS.map((b) => b.id);
