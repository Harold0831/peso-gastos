-- Categorías por defecto de Peso
insert into public.categories (name, icon, color, is_default)
values
  ('Alimentación', 'cart', '#2563EB', true),
  ('Transporte', 'car', '#6B7280', true),
  ('Salud', 'health', '#16A34A', true),
  ('Entretenimiento', 'play', '#8B7355', true),
  ('Servicios/Facturas', 'receipt', '#94A3B8', true),
  ('Compras', 'bag', '#475569', true),
  ('Transferencias', 'transfer', '#64748B', true),
  ('Educación', 'book', '#7C6FBF', true),
  ('Otros', 'tag', '#9CA3AF', true)
-- Sin target de conflicto: tras la migración 0008 el unique sobre `name` se
-- reemplaza por uno acotado al ámbito (user_id, name); `do nothing` a secas
-- salta cualquier duplicado sin depender del nombre exacto del índice.
on conflict do nothing;
