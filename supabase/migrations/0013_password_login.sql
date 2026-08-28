-- Login con correo y contraseña (además del de Google)
--
-- Google deja de ser la única puerta de entrada. Motivo de fondo: en iOS,
-- una PWA instalada que navega a accounts.google.com sale del modo
-- standalone y la cookie de sesión termina en el almacén del navegador
-- incrustado, NO en el de la PWA — el usuario vuelve a /login en bucle.
-- Un login por correo es same-origin: nunca sale del dominio y la sesión
-- queda donde debe.
--
-- password_hash: formato `scrypt$N$r$p$salt$hash` (ver lib/password.ts).
-- Null = cuenta solo de Google, que es el caso de todos los usuarios
-- existentes.
--
-- failed_login_attempts / locked_until: freno de fuerza bruta. El endpoint
-- de login bloquea temporalmente tras varios fallos seguidos y limpia el
-- contador en cuanto entra bien.

alter table public.users
  add column if not exists password_hash text,
  add column if not exists failed_login_attempts int not null default 0,
  add column if not exists locked_until timestamptz;
