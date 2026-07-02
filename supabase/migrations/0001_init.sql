-- Peso — esquema inicial
-- Aplica con: supabase db push  (o pega en el SQL Editor de Supabase)

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null default '🏷️',
  color text not null default '#6B7280',
  is_default boolean not null default false
);

create type public.transaction_type as enum ('expense', 'income');

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text unique,
  type public.transaction_type not null,
  merchant text not null,
  amount decimal(12, 2) not null check (amount >= 0),
  currency text not null default 'DOP',
  date timestamptz not null,
  card_last4 text,
  available_balance decimal(12, 2),
  category text,
  ai_suggested_category text,
  confirmed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  raw_email_snippet text
);

create index if not exists transactions_date_idx on public.transactions (date desc);
create index if not exists transactions_confirmed_idx on public.transactions (confirmed) where confirmed = false;

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null,
  limit_amount decimal(12, 2) not null check (limit_amount > 0),
  created_at timestamptz not null default now(),
  unique (category_id, month)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount decimal(12, 2) not null check (target_amount > 0),
  current_amount decimal(12, 2) not null default 0,
  deadline date,
  icon text not null default '🎯',
  color text not null default '#2563EB',
  created_at timestamptz not null default now()
);

-- Credenciales WebAuthn (passkeys). App de un solo usuario: user_handle fijo.
create table if not exists public.webauthn_credentials (
  id text primary key, -- credential id en base64url
  public_key text not null, -- clave pública en base64url
  counter bigint not null default 0,
  transports text[],
  created_at timestamptz not null default now()
);

-- RLS: la app accede solo desde el servidor con la service role key
-- (que ignora RLS). Se habilita RLS sin policies para que la anon key
-- no pueda leer ni escribir nada si llegara a filtrarse.
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.webauthn_credentials enable row level security;
