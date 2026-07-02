-- Categorías por defecto de Peso
insert into public.categories (name, icon, color, is_default)
values
  ('Alimentación', '🛒', '#2563EB', true),
  ('Transporte', '🚗', '#6B7280', true),
  ('Salud', '💊', '#16A34A', true),
  ('Entretenimiento', '🎬', '#8B7355', true),
  ('Servicios/Facturas', '📄', '#94A3B8', true),
  ('Compras', '🛍️', '#475569', true),
  ('Transferencias', '🔁', '#64748B', true),
  ('Educación', '📚', '#7C6FBF', true),
  ('Otros', '📌', '#9CA3AF', true)
on conflict (name) do nothing;
