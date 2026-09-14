-- Por QUÉ se apagó el sync de una cuenta, no solo QUE se apagó.
--
-- `gmail_accounts.sync_enabled = false` significaba una sola cosa —"el token
-- se revocó, reconecta"— y la app le enseñaba ese banner a todo el mundo. El
-- 2026-09-11 apareció un caso donde ese mensaje es MENTIRA y además un
-- callejón sin salida: se puede entrar con Google usando una dirección que no
-- es de Gmail (…@live.com.mx, …@outlook.com). Esa cuenta pasa el OAuth y
-- otorga gmail.readonly sin problema, pero al leer el buzón la API responde
-- 400 failedPrecondition "Mail service not enabled" — no hay buzón que leer.
--
-- A esa persona la app le decía "Reconectar Gmail": reconecta, se vuelve a
-- activar el sync, vuelve a fallar, vuelve a salir el banner. Para siempre.
--
-- Valores (ver GmailDisabledReason en lib/users.ts):
--   'revoked'    → el refresh token se revocó o expiró. SE ARREGLA reconectando.
--   'no_mailbox' → la cuenta de Google no tiene Gmail. NO se arregla con nada.
--   null         → apagado antes de esta migración, o sin motivo registrado.
--                  Se trata como 'revoked', que es lo que era hasta ahora.
--
-- Es solo informativo: quien decide si el sync corre sigue siendo
-- `sync_enabled`. Esta columna decide qué se le DICE a la persona.

alter table public.gmail_accounts
  add column if not exists sync_disabled_reason text;

alter table public.gmail_accounts drop constraint if exists gmail_accounts_disabled_reason_check;
alter table public.gmail_accounts
  add constraint gmail_accounts_disabled_reason_check
  check (sync_disabled_reason is null or sync_disabled_reason in ('revoked', 'no_mailbox'));

-- Al reconectar con éxito hay que limpiarla: si se quedara pegada, una cuenta
-- ya arreglada seguiría mostrando el motivo viejo. Lo hace linkGmailAccount().
