-- Captura por API (iPhone Shortcut): token de escritura por usuario,
-- origen de la transacción, y moneda de display por usuario.
-- Aplica con: pega en el SQL Editor de Supabase (o supabase db push)

-- 1. Tokens de API para escritura sin sesión interactiva (el Shortcut no
--    puede hacer el flujo OAuth). Se guarda el HASH (SHA-256), nunca el
--    token en texto plano — un dump de la DB no debe filtrar credenciales
--    usables. Un token por usuario basta, pero la tabla permite revocar y
--    rotar sin tocar otras filas.
create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  name text,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.api_tokens enable row level security;

create index if not exists api_tokens_user_idx on public.api_tokens (user_id);

-- 2. Origen de cada transacción: 'email' (parsing de correos bancarios),
--    'manual' (alta desde la web) o 'voice' (Shortcut de iOS). NULL en las
--    filas anteriores a esta migración — no se reescribe el histórico.
alter table public.transactions
  add column if not exists source text check (source in ('email', 'manual', 'voice'));

-- 3. Moneda "de casa" de cada usuario: en la que ve sus totales/gráficas.
--    Default DOP (nadie cambia). Los usuarios en EUR (p. ej. captura por
--    voz desde España) la tienen en 'EUR' y su dashboard no convierte a RD$.
alter table public.users
  add column if not exists home_currency text not null default 'DOP'
    check (home_currency in ('DOP', 'USD', 'EUR'));
