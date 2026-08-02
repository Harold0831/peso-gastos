-- Saldo disponible que persiste entre meses
--
-- El balance del dashboard mostraba ingresos − gastos SOLO del mes actual,
-- así que al cambiar de mes se reiniciaba a ~cero. Ahora el número grande es
-- un saldo acumulado que se acumula mes a mes; los pills de ingresos/gastos
-- siguen siendo mensuales.
--
-- opening_balance: saldo base que el usuario fija (su saldo real de hoy).
-- opening_balance_as_of: desde cuándo aplica ese saldo — el balance mostrado
-- es opening_balance + (ingresos − gastos de las transacciones POSTERIORES a
-- esa fecha). Sin fijarlo (as_of null), el balance es el acumulado de TODO lo
-- registrado (opening_balance default 0).

alter table public.users
  add column if not exists opening_balance numeric(14, 2) not null default 0,
  add column if not exists opening_balance_as_of timestamptz;
