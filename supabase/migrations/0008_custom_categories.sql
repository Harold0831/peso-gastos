-- Categorías personalizadas por usuario
--
-- Hasta ahora las categorías eran 9 globales compartidas (seed.sql), sin
-- dueño. Esta migración permite que cada usuario cree las suyas SIN tocar
-- las globales: una fila con user_id NULL sigue siendo una categoría por
-- defecto visible para todos; con user_id, es privada de ese usuario.
--
-- El unique global sobre `name` estorbaba (dos usuarios podrían querer
-- "Mascota", y una categoría propia no debe chocar con la de otro usuario):
-- se reemplaza por un unique acotado al ámbito (globales entre sí, y las de
-- cada usuario entre sí). Postgres trata NULL como distinto en un unique,
-- así que se usa un uuid centinela para agrupar las globales.

alter table public.categories
  add column if not exists user_id uuid references public.users (id) on delete cascade;

alter table public.categories drop constraint if exists categories_name_key;

create unique index if not exists categories_scope_name_idx
  on public.categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), name);

create index if not exists categories_user_id_idx on public.categories (user_id);
