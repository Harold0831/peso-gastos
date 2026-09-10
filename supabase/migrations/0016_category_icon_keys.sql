-- Los íconos de categoría dejan de ser emoji y pasan a ser CLAVES de un
-- registro de SVG (`src/components/category-icons.tsx`).
--
-- Por qué: un emoji lo dibuja cada sistema operativo a su manera (el mismo
-- 🛍️ no se parece en iPhone y en Android), no se repinta con el tema — sobre
-- fondo oscuro se ve como una calcomanía brillante — y no encaja con el resto
-- de la interfaz, que es de trazo lineal.
--
-- La columna sigue siendo `text` a propósito: el catálogo de íconos vive en el
-- código, no en la base. Una clave desconocida no rompe nada, cae en "tag".

-- 1. Las 9 globales del seed, por nombre.
update public.categories set icon = 'cart'     where user_id is null and name = 'Alimentación';
update public.categories set icon = 'car'      where user_id is null and name = 'Transporte';
update public.categories set icon = 'health'   where user_id is null and name = 'Salud';
update public.categories set icon = 'play'     where user_id is null and name = 'Entretenimiento';
update public.categories set icon = 'receipt'  where user_id is null and name = 'Servicios/Facturas';
update public.categories set icon = 'bag'      where user_id is null and name = 'Compras';
update public.categories set icon = 'transfer' where user_id is null and name = 'Transferencias';
update public.categories set icon = 'book'     where user_id is null and name = 'Educación';
update public.categories set icon = 'tag'      where user_id is null and name = 'Otros';

-- 2. Las personalizadas: traduce los emoji que el selector llegó a ofrecer.
--    Debe coincidir con LEGACY_EMOJI en category-icons.tsx — ese mapa es la
--    red de seguridad para lo que esta migración no alcance (una categoría
--    creada entre el deploy y esta corrida, un backup viejo restaurado).
update public.categories
set icon = case icon
  when '🛒' then 'cart'
  when '🚗' then 'car'
  when '💊' then 'health'
  when '🎬' then 'play'
  when '📄' then 'receipt'
  when '🛍️' then 'bag'
  when '🔁' then 'transfer'
  when '📚' then 'book'
  when '🎓' then 'book'
  when '📌' then 'tag'
  when '🏷️' then 'tag'
  when '🐶' then 'pet'
  when '🏋️' then 'fitness'
  when '☕' then 'coffee'
  when '🎁' then 'gift'
  when '✈️' then 'flight'
  when '🍔' then 'food'
  when '💅' then 'gift'
  when '🎮' then 'game'
  when '🏠' then 'home'
  when '👶' then 'pet'
  when '💰' then 'money'
  else 'tag'
end
where user_id is not null;

-- 3. El default de la columna era un emoji.
alter table public.categories alter column icon set default 'tag';

-- Las METAS de ahorro (savings_goals.icon) se quedan con emoji a propósito:
-- ahí el ícono es una decisión personal del usuario sobre SU meta ("🏝️ Viaje"),
-- no parte del vocabulario visual de la app.
