import { z } from "zod";
import { BANK_IDS } from "./banks";

/**
 * Normaliza un monto tecleado a número, aceptando separador decimal por
 * COMA (formato europeo/español: "12,50" o "1.234,56") además del punto.
 * El campo llega como string desde el form; sin esto, `Number("12,50")`
 * daría NaN y el usuario vería "el monto debe ser mayor que 0" sin
 * entender por qué (bug real con la cuenta en EUR de España, cuyo teclado
 * usa coma decimal).
 */
function normalizeAmount(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return v;
  // Con coma presente asumimos formato europeo: el punto es separador de
  // miles (se quita) y la coma es el decimal (pasa a punto).
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isNaN(n) ? v : n;
}

/** Monto monetario positivo, tolerante a coma decimal. */
const amountField = (msg: string) => z.preprocess(normalizeAmount, z.number().positive(msg));

export const transactionSchema = z.object({
  type: z.enum(["expense", "income"]),
  merchant: z.string().trim().min(1, "Escribe el nombre del comercio"),
  amount: amountField("El monto debe ser mayor que 0"),
  currency: z.enum(["DOP", "USD", "EUR"]).default("DOP"),
  date: z.string().min(1, "Selecciona la fecha"),
  category: z.string().trim().min(1, "Selecciona una categoría"),
  notes: z.string().trim().optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

export const confirmSchema = z.object({
  id: z.string().min(1),
  category: z.string().trim().min(1, "Selecciona una categoría"),
  notes: z.string().trim().optional(),
  // Modo "Editar transacción" del detalle: solo llegan los campos que
  // el usuario cambió de verdad (el resto viene undefined).
  amount: amountField("El monto debe ser mayor que 0").optional(),
  merchant: z.string().trim().min(1, "El comercio no puede quedar vacío").optional(),
  date: z.string().datetime({ message: "Fecha inválida" }).optional(),
  type: z.enum(["expense", "income"]).optional(),
});

export const bulkConfirmSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "Selecciona al menos una transacción"),
  category: z.string().trim().min(1, "Selecciona una categoría"),
});

export const budgetSchema = z.object({
  category_id: z.string().min(1, "Selecciona una categoría"),
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Mes inválido"),
  limit_amount: amountField("El límite debe ser mayor que 0"),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la meta"),
  target_amount: amountField("El monto objetivo debe ser mayor que 0"),
  deadline: z.string().optional(),
  icon: z.string().trim().min(1).max(4).default("🎯"),
});

export const contributionSchema = z.object({
  goal_id: z.string().min(1),
  amount: amountField("El abono debe ser mayor que 0"),
});

/** Bancos a sincronizar (perfil → "Mis bancos"). Vacío no es válido:
 *  para "ninguno" está el toggle de desvincular Gmail. */
export const enabledBanksSchema = z.object({
  banks: z.array(z.enum(BANK_IDS as [string, ...string[]])).min(1, "Selecciona al menos un banco"),
});

/** Captura por voz (Shortcut de iOS). Dos modos: rápido (campos directos)
 *  y dictado (texto libre parseado con IA). La categoría del modo rápido se
 *  revalida contra las categorías reales en el endpoint. */
export const voiceEntrySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("quick"),
    category: z.string().trim().min(1, "Falta la categoría"),
    amount: amountField("El monto debe ser mayor que 0"),
    description: z.string().trim().max(120).optional(),
  }),
  z.object({
    mode: z.literal("dictate"),
    text: z.string().trim().min(1, "No recibí ninguna frase"),
  }),
]);

/** Saldo disponible que el usuario fija a mano ("Ajustar saldo"). A
 *  diferencia de un monto de transacción, puede ser cero o negativo (estar
 *  en rojo), así que no usa amountField. */
export const openingBalanceSchema = z.object({
  amount: z.preprocess(normalizeAmount, z.number({ message: "Escribe un monto válido" })),
});

/** Gasto fijo / pago recurrente. El monto es opcional (algunos varían). */
export const recurringExpenseSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(40, "Máximo 40 caracteres"),
  amount: amountField("El monto debe ser mayor que 0").optional(),
  currency: z.enum(["DOP", "USD", "EUR"]).default("DOP"),
  category: z.string().trim().min(1).optional(),
  due_day: z.coerce.number().int().min(1).max(31).optional(),
});

/** Marca un gasto fijo como pagado/pendiente en un mes (override manual). */
export const recurringPaidSchema = z.object({
  recurring_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Mes inválido"),
  status: z.enum(["paid", "pending"]),
});

/** Categoría personalizada del usuario (perfil → "Mis categorías"). El
 *  emoji y el color se eligen de paletas fijas en la UI, pero se validan
 *  igual aquí por si la request no viene del formulario. */
export const categorySchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre").max(24, "Máximo 24 caracteres"),
  icon: z.string().trim().min(1, "Elige un emoji").max(4),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color inválido"),
});

/** Descartes de la bandeja de notificaciones (uno o varios de un tap). */
export const dismissNotificationsSchema = z.object({
  entries: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        context: z.string().max(200).optional(),
      }),
    )
    .min(1),
});

/** Suscripción Web Push tal como la entrega pushManager.subscribe().toJSON(). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url("Suscripción inválida"),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/** Alta de token de API (endpoint admin). */
export const mintTokenSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  home_currency: z.enum(["DOP", "USD", "EUR"]).optional(),
});
