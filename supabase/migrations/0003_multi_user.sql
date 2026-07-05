-- Multi-usuario: cuentas con Google, Gmail por usuario, user_id en todo.
-- Aplica con: pega en el SQL Editor de Supabase (o supabase db push)

-- 1. Usuarios. google_sub es nullable: la fila de Harold se crea aquí por
--    email y se "reclama" (se le asigna el sub) en su primer login con Google.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique,
  email text not null unique,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- 2. Cuenta de Gmail vinculada (opcional, 1 por usuario). El refresh token
--    va cifrado con AES-256-GCM (TOKEN_ENCRYPTION_KEY en el servidor).
create table if not exists public.gmail_accounts (
  user_id uuid primary key references public.users (id) on delete cascade,
  email text not null unique,
  refresh_token_enc text not null,
  watch_expiration timestamptz,
  sync_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gmail_accounts enable row level security;

-- 3. Feedback de usuarios (Fase 4)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- 4. Usuario de Harold + backfill de todos los datos existentes
insert into public.users (email, name)
values ('harold3112@gmail.com', 'Harold')
on conflict (email) do nothing;

alter table public.transactions add column if not exists user_id uuid references public.users (id) on delete cascade;
alter table public.budgets add column if not exists user_id uuid references public.users (id) on delete cascade;
alter table public.savings_goals add column if not exists user_id uuid references public.users (id) on delete cascade;
alter table public.webauthn_credentials add column if not exists user_id uuid references public.users (id) on delete cascade;

update public.transactions set user_id = u.id from public.users u where u.email = 'harold3112@gmail.com' and public.transactions.user_id is null;
update public.budgets set user_id = u.id from public.users u where u.email = 'harold3112@gmail.com' and public.budgets.user_id is null;
update public.savings_goals set user_id = u.id from public.users u where u.email = 'harold3112@gmail.com' and public.savings_goals.user_id is null;
update public.webauthn_credentials set user_id = u.id from public.users u where u.email = 'harold3112@gmail.com' and public.webauthn_credentials.user_id is null;

alter table public.transactions alter column user_id set not null;
alter table public.budgets alter column user_id set not null;
alter table public.savings_goals alter column user_id set not null;
alter table public.webauthn_credentials alter column user_id set not null;

-- 5. Constraints únicos ahora son por usuario
alter table public.transactions drop constraint if exists transactions_gmail_message_id_key;
create unique index if not exists transactions_user_gmail_msg_idx
  on public.transactions (user_id, gmail_message_id)
  where gmail_message_id is not null;

alter table public.budgets drop constraint if exists budgets_category_id_month_key;
create unique index if not exists budgets_user_category_month_idx
  on public.budgets (user_id, category_id, month);

-- 6. Índices de lectura por usuario
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, date desc)
  where deleted_at is null;
create index if not exists budgets_user_idx on public.budgets (user_id);
create index if not exists savings_goals_user_idx on public.savings_goals (user_id);
create index if not exists webauthn_credentials_user_idx on public.webauthn_credentials (user_id);
