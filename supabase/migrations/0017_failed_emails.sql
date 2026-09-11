-- Guarda el correo que el parser NO pudo leer, para poder arreglarlo.
--
-- El problema: cuando un banco cambia el formato, las transacciones dejan de
-- aparecer en silencio. El monitoreo ya avisa (ver lib/monitoring.ts) y manda
-- el ESQUELETO del correo, pero un esqueleto no basta cuando el formato cambia
-- entero: pasó con el Popular, donde el aviso decía "Etiquetas encontradas:
-- ninguna" y no había nada con que trabajar. Y como el webhook dispara para el
-- buzón que CAMBIÓ, el correo casi nunca es de quien opera la instancia — no
-- hay forma de conseguir la muestra.
--
-- Reglas que hacen esto aceptable, y que el código debe respetar:
--
--  1. SOLO fallos. Un correo que se parseó bien nunca se guarda; tampoco los
--     ignorables (estados de cuenta, OTP). Ver runSyncForUser().
--  2. CIFRADO con la misma clave que los refresh tokens (AES-256-GCM,
--     lib/crypto.ts). Un dump de la base no debe entregar correos bancarios.
--  3. CADUCA solo. `expires_at` lo fija el código y el cron diario borra lo
--     vencido. No es una papelera que crece para siempre.
--  4. `on delete cascade`: al eliminar la cuenta se va con todo lo demás —
--     eso es parte del contrato de deleteAccountAction.
--
-- La política de privacidad se actualizó para decir esto explícitamente: la
-- frase "el cuerpo del mensaje se descarta" ya no era cierta sin excepción.

create table if not exists public.failed_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  gmail_message_id text not null,
  -- Id del banco en bank-parser.ts, o "desconocido" si el remitente no está
  -- en el registro (que ya sería en sí el dato interesante).
  bank text not null,
  subject text not null,
  from_address text not null,
  received_at timestamptz,
  -- base64(iv + authTag + ciphertext) del cuerpo, ver lib/crypto.ts
  body_enc text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- Un correo que falla vuelve a fallar en CADA sync (el parser no ha cambiado).
-- Sin esto, un solo correo roto acumularía una fila por corrida.
create unique index if not exists failed_emails_user_message_idx
  on public.failed_emails (user_id, gmail_message_id);

-- El barrido del cron ordena por caducidad.
create index if not exists failed_emails_expires_idx
  on public.failed_emails (expires_at);

alter table public.failed_emails enable row level security;

-- `transactions.source` gana el valor 'ai': el correo lo leyó Gemini porque
-- ningún parser supo. El check original solo admitía email/manual/voice, así
-- que sin esto el insert fallaría en producción con un error de restricción.
--
-- Importa distinguirlo de 'email': una fila leída por IA entra SIEMPRE sin
-- confirmar y sin auto-confirmación, y el detalle lo dice, porque el monto y
-- la fecha salieron de un modelo sobre un formato que nadie ha verificado.
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('email', 'manual', 'voice', 'ai'));
