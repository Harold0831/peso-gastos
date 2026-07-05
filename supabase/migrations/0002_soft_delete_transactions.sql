-- Soft delete de transacciones.
-- Aplica con: pega en el SQL Editor de Supabase (o supabase db push)
--
-- Un DELETE real deja libre el gmail_message_id: el próximo sync (webhook
-- o manual) vuelve a encontrar ese correo en Gmail, no lo ve en la tabla
-- y lo re-inserta como si fuera nuevo. El soft delete mantiene la fila
-- (marcada) para que runSync() la siga reconociendo como ya procesada.

alter table public.transactions
  add column if not exists deleted_at timestamptz;

create index if not exists transactions_active_idx
  on public.transactions (date desc)
  where deleted_at is null;
