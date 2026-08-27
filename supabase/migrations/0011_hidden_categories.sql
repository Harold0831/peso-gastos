-- Ocultar categorías por defecto (por usuario)
--
-- Las 9 categorías del seed son GLOBALES (user_id null): las comparten todos
-- los usuarios, así que borrarlas de verdad afectaría a los demás. En vez de
-- eso, cada usuario puede ocultar las que no usa: dejan de ofrecerse al
-- elegir categoría, pero el historial que ya las usa se mantiene intacto
-- (las transacciones guardan el NOMBRE de la categoría, no su id).
--
-- Es reversible: quitar la fila vuelve a mostrarla.

create table if not exists public.hidden_categories (
  user_id uuid not null references public.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create index if not exists hidden_categories_user_idx on public.hidden_categories (user_id);

alter table public.hidden_categories enable row level security;
