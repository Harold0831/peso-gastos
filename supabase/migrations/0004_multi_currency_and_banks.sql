-- Multi-moneda + selección de bancos por usuario.
-- Aplica con: pega en el SQL Editor de Supabase (o supabase db push)

-- 1. Cache diaria de la tasa de cambio USD→DOP. Una fila por día;
--    `rate` = pesos por 1 dólar. `source` identifica el proveedor que la
--    dio ese día ("er-api" hoy; "bcrd" cuando se integre el Banco Central).
--    La escribe el servidor (exchange-rate.ts) la primera vez que alguien
--    la necesita cada día — no hace falta cron propio.
create table if not exists public.exchange_rates (
  day date primary key,
  rate numeric(10, 4) not null check (rate > 0),
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.exchange_rates enable row level security;

-- 2. Tasa aplicada a cada transacción en moneda extranjera, capturada en
--    el momento del sync (o del alta manual). NULL para transacciones en
--    DOP y para las históricas anteriores a esta migración — la capa de
--    lectura usa la última tasa cacheada como fallback para esas.
alter table public.transactions
  add column if not exists exchange_rate numeric(10, 4) check (exchange_rate > 0);

-- 3. Bancos que el usuario quiere sincronizar (ids de bank-parser.ts:
--    'qik', 'popular', 'caribe', 'scotiabank', 'bhd'). NULL = todos,
--    que es el comportamiento actual — nadie pierde sync con la migración.
alter table public.gmail_accounts
  add column if not exists enabled_banks text[];
