-- Descartes de la bandeja de notificaciones in-app.
-- Aplica con: pega en el SQL Editor de Supabase (o supabase db push)

-- La bandeja se deriva del estado (getAttentionItems), así que "descartar"
-- no borra nada: guarda qué aviso ignoró el usuario. `context` permite que
-- un aviso descartado REAPAREZCA cuando hay información nueva (p. ej. el
-- resumen de pendientes guarda el created_at de la más reciente al
-- descartar; si llega una más nueva, el aviso vuelve). En la DB (no
-- localStorage) para que el contador de la campanita y la bandeja siempre
-- coincidan — ambos se calculan en el servidor.
create table if not exists public.notification_dismissals (
  user_id uuid not null references public.users (id) on delete cascade,
  item_id text not null,
  context text,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.notification_dismissals enable row level security;
