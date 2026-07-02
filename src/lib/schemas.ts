import { z } from "zod";

export const transactionSchema = z.object({
  type: z.enum(["expense", "income"]),
  merchant: z.string().trim().min(1, "Escribe el nombre del comercio"),
  amount: z.coerce.number().positive("El monto debe ser mayor que 0"),
  date: z.string().min(1, "Selecciona la fecha"),
  category: z.string().trim().min(1, "Selecciona una categoría"),
  notes: z.string().trim().optional(),
});

export type TransactionInput = z.infer<typeof transactionSchema>;

export const confirmSchema = z.object({
  id: z.string().min(1),
  category: z.string().trim().min(1, "Selecciona una categoría"),
  notes: z.string().trim().optional(),
  // "Editar monto" en la pantalla de confirmación
  amount: z.coerce.number().positive("El monto debe ser mayor que 0").optional(),
});

export const budgetSchema = z.object({
  category_id: z.string().min(1, "Selecciona una categoría"),
  month: z.string().regex(/^\d{4}-\d{2}-01$/, "Mes inválido"),
  limit_amount: z.coerce.number().positive("El límite debe ser mayor que 0"),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre de la meta"),
  target_amount: z.coerce.number().positive("El monto objetivo debe ser mayor que 0"),
  deadline: z.string().optional(),
  icon: z.string().trim().min(1).max(4).default("🎯"),
});

export const contributionSchema = z.object({
  goal_id: z.string().min(1),
  amount: z.coerce.number().positive("El abono debe ser mayor que 0"),
});
