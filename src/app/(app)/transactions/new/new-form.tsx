"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { transactionSchema, type TransactionInput } from "@/lib/schemas";

// z.coerce.number() acepta unknown como entrada: el form trabaja con el tipo
// de entrada del schema y handleSubmit entrega el tipo de salida ya coercido.
type FormInput = z.input<typeof transactionSchema>;
import { createTransaction } from "@/lib/actions";
import { BackIcon } from "@/components/icons";

export function NewTransactionForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: "expense",
      merchant: "",
      currency: "DOP",
      date: new Date().toISOString().slice(0, 16),
      category: "",
      notes: "",
    },
  });

  const type = watch("type");
  const category = watch("category");
  const currency = watch("currency");

  const onSubmit = (data: TransactionInput) => {
    setServerError(null);
    startSaving(async () => {
      const result = await createTransaction(data);
      if (!result.ok) {
        setServerError(result.error ?? "No se pudo guardar");
        return;
      }
      router.push("/transactions");
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

  return (
    <main className="pt-safe">
      <div className="flex items-center px-4 py-2">
        <button onClick={() => router.back()} aria-label="Volver" className="p-2 text-ink">
          <BackIcon />
        </button>
        <h1 className="flex-1 text-center text-[15px] font-semibold tracking-tight text-ink">
          Nueva transacción
        </h1>
        <span className="w-[38px]" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 px-5 pt-4">
        {/* Tipo */}
        <div className="flex rounded-btn border border-line bg-surface p-1">
          {(
            [
              ["expense", "Gasto"],
              ["income", "Ingreso"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setValue("type", value)}
              className={`flex-1 rounded-[9px] py-2.5 text-[13px] font-bold transition ${
                type === value
                  ? value === "expense"
                    ? "bg-expense text-white"
                    : "bg-income text-white"
                  : "text-ink-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink">
            Comercio o remitente
          </label>
          <input
            {...register("merchant")}
            placeholder="Ej. Supermercado Nacional"
            className={inputClass}
          />
          {errors.merchant && (
            <p className="mt-1 text-xs font-medium text-expense">{errors.merchant.message}</p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink">
              Monto
            </label>
            <div className="flex rounded-pill border border-line bg-surface p-0.5">
              {(
                [
                  ["DOP", "RD$"],
                  ["USD", "US$"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue("currency", value)}
                  className={`rounded-pill px-3 py-1 text-[11px] font-bold transition ${
                    currency === value ? "bg-accent text-white" : "text-ink-muted"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <input
            {...register("amount")}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            className={inputClass}
          />
          {currency === "USD" && (
            <p className="mt-1 text-[11px] text-ink-muted">
              Se convierte a RD$ con la tasa del día para tus totales y presupuestos.
            </p>
          )}
          {errors.amount && (
            <p className="mt-1 text-xs font-medium text-expense">{errors.amount.message}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink">
            Fecha y hora
          </label>
          <input {...register("date")} type="datetime-local" className={inputClass} />
          {errors.date && (
            <p className="mt-1 text-xs font-medium text-expense">{errors.date.message}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink">
            Categoría
          </label>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setValue("category", name, { shouldValidate: true })}
                className={`shrink-0 rounded-pill border px-3.5 py-2 text-xs font-semibold transition ${
                  category === name
                    ? "border-accent bg-accent text-white"
                    : "border-line bg-surface text-ink"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          {errors.category && (
            <p className="mt-1 text-xs font-medium text-expense">{errors.category.message}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink">
            Nota (opcional)
          </label>
          <textarea
            {...register("notes")}
            placeholder="Añadir nota…"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        {serverError && <p className="text-sm font-medium text-expense">{serverError}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mb-4 w-full rounded-[14px] bg-accent py-4 text-[15px] font-bold tracking-tight text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar transacción"}
        </button>
      </form>
    </main>
  );
}
