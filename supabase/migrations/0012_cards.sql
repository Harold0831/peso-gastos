-- Tarjetas del usuario (control de gastos por tarjeta)
--
-- `transactions.card_last4` YA existía desde el inicio y los 5 parsers de
-- bancos lo llenan, así que el historial completo ya viene etiquetado por
-- tarjeta. Esta tabla solo le pone NOMBRE a esos últimos 4 dígitos: no hace
-- falta backfill ni tocar la tabla de transacciones.
--
-- El vínculo es por (user_id, last4), no por FK: así una tarjeta registrada
-- hoy agrupa al instante todas las transacciones viejas con ese last4, y
-- borrarla solo quita la etiqueta — las transacciones no se tocan.
--
-- `type` es informativo (débito/crédito). A propósito NO cambia el cálculo
-- del saldo ni de los presupuestos: modelar el crédito de verdad exigiría
-- ciclos de corte, saldo por tarjeta y pagos de factura.

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  nickname text not null,
  type text not null default 'debit' check (type in ('debit', 'credit')),
  color text not null default '#2563EB',
  created_at timestamptz not null default now(),
  unique (user_id, last4)
);

create index if not exists cards_user_idx on public.cards (user_id);

alter table public.cards enable row level security;
