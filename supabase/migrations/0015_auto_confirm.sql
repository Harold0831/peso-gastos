-- Auto-confirmación de transacciones de comercios ya conocidos.
--
-- Problema: TODA transacción importada por correo llega como "por confirmar",
-- aunque sea la quinta vez que llega el mismo Netflix. Un usuario real acumuló
-- 244 pendientes — la pantalla deja de ser una bandeja y pasa a ser una deuda.
--
-- Si ya categorizaste un comercio varias veces, la próxima igual se confirma
-- sola con esa categoría. Ver `merchant-history.ts` para las reglas exactas.

-- Marca las que confirmó Peso y no la persona. Hace falta explícita (no se
-- puede deducir de `confirmed`): la UI las señala y el usuario tiene derecho a
-- saber qué decidió él y qué decidió la app con su dinero.
alter table public.transactions
  add column if not exists auto_confirmed boolean not null default false;

-- Interruptor por usuario. Default true (la función solo ayuda si está
-- encendida), pero apagable: es automatización silenciosa sobre datos
-- financieros, y quien no la quiera debe poder quitarla sin pedirle permiso a
-- nadie.
alter table public.users
  add column if not exists auto_confirm_enabled boolean not null default true;

-- El sync arma las reglas leyendo el historial ya confirmado del usuario:
-- (user_id, confirmed) es el filtro exacto de esa consulta.
create index if not exists transactions_user_confirmed_idx
  on public.transactions (user_id, confirmed);
