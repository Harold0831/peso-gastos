"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Category } from "@/lib/types";
import {
  createCategory,
  deleteCategory,
  restoreDefaultCategories,
  setCategoryHidden,
  updateCategory,
} from "@/lib/actions";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PencilIcon, TrashIcon, UndoIcon } from "@/components/icons";
import { CategoryIcon } from "@/components/category-icons";
import { CATEGORY_ICON_KEYS, FALLBACK_CATEGORY_ICON } from "@/lib/category-icons";

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

export function CategoriesClient({
  globals,
  custom,
  hiddenIds,
  demoMode,
}: {
  globals: Category[];
  custom: Category[];
  hiddenIds: string[];
  demoMode?: boolean;
}) {
  const hidden = new Set(hiddenIds);
  // Las quitadas no se listan: el usuario las "eliminó" y no deben seguir
  // ocupando espacio. Vuelven con "Restablecer".
  const visibleGlobals = globals.filter((c) => !hidden.has(c.id));
  const removedCount = globals.length - visibleGlobals.length;
  // null = sin formulario; "new" = alta; una categoría = edición
  const [form, setForm] = useState<"new" | Category | null>(null);

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Categorías</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Crea las tuyas y elimina las que no uses. Aparecen al registrar gastos, en presupuestos y
          en las gráficas.
        </p>
      </div>

      {/* Propias */}
      <section className="mx-5 mb-3.5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Mis categorías
        </h2>
        {custom.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-muted">
            Todavía no has creado ninguna. Prueba con Mascota, Gym o Café.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-card border border-line bg-card">
            {custom.map((cat, i) => (
              <CustomRow
                key={cat.id}
                category={cat}
                divider={i < custom.length - 1}
                onEdit={() => setForm(cat)}
                demoMode={demoMode}
              />
            ))}
          </ul>
        )}

        {form === "new" ? (
          <CategoryForm mode="new" onClose={() => setForm(null)} demoMode={demoMode} />
        ) : form ? (
          <CategoryForm
            mode="edit"
            category={form}
            onClose={() => setForm(null)}
            demoMode={demoMode}
          />
        ) : (
          <button
            type="button"
            onClick={() => setForm("new")}
            disabled={demoMode}
            className="mt-2.5 w-full rounded-btn border border-dashed border-line py-3 text-[13px] font-semibold text-accent disabled:opacity-50"
          >
            + Nueva categoría
          </button>
        )}
      </section>

      {/* Globales */}
      <section className="mx-5 mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Por defecto
        </h2>
        {visibleGlobals.length === 0 ? (
          <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-muted">
            Quitaste todas las categorías por defecto.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-card border border-line bg-card">
            {visibleGlobals.map((cat, i) => (
              <GlobalRow
                key={cat.id}
                category={cat}
                divider={i < visibleGlobals.length - 1}
                demoMode={demoMode}
              />
            ))}
          </ul>
        )}

        {removedCount > 0 && <RestoreDefaults count={removedCount} demoMode={demoMode} />}

        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-muted">
          Al eliminar una categoría por defecto deja de ofrecerse al registrar gastos. Tus
          transacciones y gráficas de siempre no cambian, y puedes restablecerla cuando quieras.
        </p>
      </section>
    </main>
  );
}

/**
 * Fila de categoría por defecto. Se presenta como "Eliminar" (es lo que el
 * usuario quiere: que no ocupe espacio en su lista); por dentro solo se
 * oculta, ver setCategoryHidden.
 */
function GlobalRow({
  category,
  divider,
  demoMode,
}: {
  category: Category;
  divider: boolean;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startBusy] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const remove = () => {
    startBusy(async () => {
      const result = await setCategoryHidden({ category_id: category.id, hidden: true });
      if (!result.ok) {
        toast(result.error ?? "No se pudo eliminar", "error");
        setConfirming(false);
        return;
      }
      toast("Categoría eliminada");
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${divider ? "border-b border-line" : ""}`}>
      {/* El glifo va en un token del tema y NO en `category.color`: esos
          colores se eligieron para el tema claro, y los grises del seed
          (#475569, #6B7280) quedan casi invisibles sobre fondo oscuro. El
          ícono identifica; el color informa, y sigue haciéndolo donde lleva
          dato de verdad (las barras del presupuesto y el donut). */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-background text-ink-muted">
        <CategoryIcon icon={category.icon} size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
        {category.name}
      </span>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy || demoMode}
        aria-label={`Eliminar ${category.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-muted transition active:bg-background disabled:opacity-50"
      >
        <TrashIcon size={19} />
      </button>

      <ConfirmDialog
        open={confirming}
        title={`¿Eliminar "${category.name}"?`}
        description="Dejará de aparecer al registrar gastos. Tus transacciones y gráficas no cambian, y puedes restablecerla cuando quieras."
        confirmLabel="Eliminar"
        pending={busy}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

/** Vía de vuelta: como las eliminadas ya no se listan, sin esto no habría
 *  forma de recuperarlas. Solo aparece si hay algo que restablecer. */
function RestoreDefaults({ count, demoMode }: { count: number; demoMode?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, startBusy] = useTransition();

  const restore = () => {
    startBusy(async () => {
      const result = await restoreDefaultCategories();
      if (!result.ok) {
        toast(result.error ?? "No se pudo restablecer", "error");
        return;
      }
      toast("✓ Categorías restablecidas");
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={restore}
      disabled={busy || demoMode}
      className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-btn border border-line py-3 text-[13px] font-semibold text-accent disabled:opacity-50"
    >
      <UndoIcon size={17} />
      {busy
        ? "Restableciendo…"
        : `Restablecer ${count} ${count === 1 ? "eliminada" : "eliminadas"}`}
    </button>
  );
}

/** Fila de categoría propia: editar y borrar. */
function CustomRow({
  category,
  divider,
  onEdit,
  demoMode,
}: {
  category: Category;
  divider: boolean;
  onEdit: () => void;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [deleting, startDeleting] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = () => {
    startDeleting(async () => {
      const result = await deleteCategory(category.id);
      if (!result.ok) {
        toast(result.error ?? "No se pudo eliminar", "error");
        setConfirming(false);
        return;
      }
      toast("Categoría eliminada");
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${divider ? "border-b border-line" : ""}`}>
      {/* El glifo va en un token del tema y NO en `category.color`: esos
          colores se eligieron para el tema claro, y los grises del seed
          (#475569, #6B7280) quedan casi invisibles sobre fondo oscuro. El
          ícono identifica; el color informa, y sigue haciéndolo donde lleva
          dato de verdad (las barras del presupuesto y el donut). */}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-background text-ink-muted">
        <CategoryIcon icon={category.icon} size={17} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
        {category.name}
      </span>
      <button
        type="button"
        onClick={onEdit}
        disabled={deleting || demoMode}
        aria-label={`Editar ${category.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-muted transition active:bg-background disabled:opacity-50"
      >
        <PencilIcon size={19} />
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={deleting || demoMode}
        aria-label={`Eliminar ${category.name}`}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-ink-muted transition active:bg-background disabled:opacity-50"
      >
        <TrashIcon size={19} />
      </button>

      <ConfirmDialog
        open={confirming}
        title={`¿Eliminar "${category.name}"?`}
        description="Solo se puede borrar si no tiene transacciones ni presupuestos usándola."
        confirmLabel="Eliminar"
        pending={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </li>
  );
}

/** Formulario compartido por alta y edición de una categoría propia. */
function CategoryForm({
  mode,
  category,
  onClose,
  demoMode,
}: {
  mode: "new" | "edit";
  category?: Category;
  onClose: () => void;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? FALLBACK_CATEGORY_ICON);
  const [color, setColor] = useState(category?.color ?? COLOR_PRESETS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // Al cambiar de categoría en edición, recarga los valores del formulario.
  useEffect(() => {
    setName(category?.name ?? "");
    setIcon(category?.icon ?? FALLBACK_CATEGORY_ICON);
    setColor(category?.color ?? COLOR_PRESETS[0]);
    setError(null);
  }, [category]);

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const payload = { name: name.trim(), icon, color };
      const result =
        mode === "edit" && category
          ? await updateCategory({ ...payload, id: category.id })
          : await createCategory(payload);
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar");
        return;
      }
      toast(mode === "edit" ? "✓ Categoría actualizada" : "✓ Categoría creada");
      onClose();
      router.refresh();
    });
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

  return (
    <div className="mt-2.5 rounded-card border border-line bg-card p-4">
      {/* Vista previa en vivo */}
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-background text-ink-muted">
          <CategoryIcon icon={icon} size={19} />
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
        Ícono
      </label>
      {/* Rejilla cerrada en vez del campo de emoji libre que había antes: el
          catálogo es el que la app sabe dibujar, así que no hay forma de
          elegir algo que luego se vea como un cuadrito. 44px de lado = el
          mínimo táctil de las guías de Apple. */}
      <div role="radiogroup" aria-label="Ícono de la categoría" className="flex flex-wrap gap-1.5">
        {CATEGORY_ICON_KEYS.map((key) => {
          const active = icon === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={key}
              onClick={() => setIcon(key)}
              className={`flex h-11 w-11 items-center justify-center rounded-btn border transition ${
                active
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-surface text-ink-muted"
              }`}
            >
              <CategoryIcon icon={key} size={20} />
            </button>
          );
        })}
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
              color === c ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""
            }`}
          />
        ))}
      </div>

      {error && <p className="mt-3 text-xs font-medium text-expense">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-semibold text-ink-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !name.trim() || demoMode}
          className="flex-[1.5] rounded-btn bg-accent-solid py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Crear categoría"}
        </button>
      </div>
    </div>
  );
}
