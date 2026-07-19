"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";
import { createCategory, deleteCategory } from "@/lib/actions";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** Emojis sugeridos para arrancar rápido; igual se puede teclear cualquiera. */
const EMOJI_PRESETS = ["🐶", "🏋️", "☕", "🎁", "✈️", "🍔", "💅", "🎮", "🏠", "👶", "💰", "🎓"];

/** Paleta de colores para las categorías (evita que elijan un hex feo o
 *  ilegible; los tonos combinan con el resto de la app). */
const COLOR_PRESETS = [
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#6B7280",
];

export function CategoryManager({
  categories,
  demoMode,
}: {
  categories: Category[];
  demoMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState(COLOR_PRESETS[0]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const resetForm = () => {
    setName("");
    setIcon("🏷️");
    setColor(COLOR_PRESETS[0]);
    setError(null);
    setAdding(false);
  };

  const handleCreate = () => {
    setError(null);
    startSaving(async () => {
      const result = await createCategory({ name: name.trim(), icon, color });
      if (!result.ok) {
        setError(result.error ?? "No se pudo crear");
        return;
      }
      toast("✓ Categoría creada");
      resetForm();
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    startDeleting(async () => {
      const result = await deleteCategory(target.id);
      if (!result.ok) {
        toast(result.error ?? "No se pudo eliminar", "error");
        setPendingDelete(null);
        return;
      }
      toast("Categoría eliminada");
      setPendingDelete(null);
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

  return (
    <section className="mx-5 mb-3.5 rounded-card border border-line bg-card p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Mis categorías
      </h2>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
        Además de las que trae Peso, crea las tuyas (Mascota, Gym, Café…). Aparecen al registrar
        gastos, en presupuestos y en las gráficas.
      </p>

      {/* Categorías propias existentes */}
      {categories.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {categories.map((cat) => (
            <li
              key={cat.id}
              className="flex items-center gap-3 rounded-btn border border-line bg-surface px-3 py-2.5"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-base"
                style={{ backgroundColor: `${cat.color}1A` }}
              >
                {cat.icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                {cat.name}
              </span>
              <button
                type="button"
                aria-label={`Eliminar ${cat.name}`}
                onClick={() => setPendingDelete(cat)}
                disabled={deleting}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-ink-muted transition active:bg-background disabled:opacity-50"
              >
                🗑️
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Alta de categoría */}
      {adding ? (
        <div className="mt-4 rounded-btn border border-line bg-background p-4">
          {/* Vista previa en vivo */}
          <div className="mb-4 flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-pill text-lg"
              style={{ backgroundColor: `${color}1A` }}
            >
              {icon}
            </span>
            <span
              className="rounded-pill px-3.5 py-2 text-xs font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {name.trim() || "Tu categoría"}
            </span>
          </div>

          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink">
            Nombre
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Mascota"
            maxLength={24}
            autoFocus
            className={inputClass}
          />

          <label className="mb-1.5 mt-4 block text-[11px] font-semibold uppercase tracking-wide text-ink">
            Emoji
          </label>
          <div className="flex items-center gap-2">
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value.slice(0, 4))}
              aria-label="Emoji de la categoría"
              className="w-14 rounded-btn border border-line bg-surface p-2 text-center text-xl outline-none focus:border-accent"
            />
            <div className="flex flex-1 flex-wrap gap-1.5">
              {EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`flex h-8 w-8 items-center justify-center rounded-pill text-base transition ${
                    icon === e ? "bg-accent/15 ring-1 ring-accent" : "bg-surface"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <label className="mb-1.5 mt-4 block text-[11px] font-semibold uppercase tracking-wide text-ink">
            Color
          </label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-8 w-8 rounded-pill transition ${
                  color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-background" : ""
                }`}
              />
            ))}
          </div>

          {error && <p className="mt-3 text-xs font-medium text-expense">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-semibold text-ink-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving || !name.trim() || demoMode}
              className="flex-[1.5] rounded-btn bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {saving ? "Creando…" : "Crear categoría"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={demoMode}
          className="mt-4 w-full rounded-btn border border-dashed border-line py-3 text-[13px] font-semibold text-accent disabled:opacity-50"
        >
          + Nueva categoría
        </button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`¿Eliminar "${pendingDelete?.name}"?`}
        description="Solo se puede borrar si no tiene transacciones ni presupuestos usándola."
        confirmLabel="Eliminar"
        pending={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
