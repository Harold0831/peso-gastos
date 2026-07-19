-- Notificaciones push (Web Push): suscripciones por usuario/dispositivo.
-- Aplica con: pega en el SQL Editor de Supabase (o supabase db push)

-- Un usuario puede tener varias suscripciones (iPhone + laptop). El
-- endpoint es único globalmente (lo genera el push service del navegador);
-- las claves p256dh/auth cifran cada mensaje para ese dispositivo.
-- Suscripciones muertas (404/410 al enviar) se borran automáticamente.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
