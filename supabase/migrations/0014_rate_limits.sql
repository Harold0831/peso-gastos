-- Rate limiting por clave (normalmente "acción:IP").
--
-- Por qué en la base de datos y no en memoria: la app corre en funciones
-- serverless de Vercel. Cada invocación puede caer en una instancia distinta,
-- así que un Map en memoria no cuenta nada útil — un atacante que dispara en
-- paralelo pega en instancias frías y esquiva el contador por completo.
--
-- El caso concreto que esto frena: /api/auth/email/register no tenía ningún
-- límite. Cada intento ejecuta un scrypt con N=32768 (~96 MB de memoria), así
-- que un script trivial creaba cuentas en bucle, tumbaba las funciones y subía
-- la factura a la vez. El freno que ya existía (failed_login_attempts) es por
-- CUENTA, así que rociar mil correos distintos lo esquivaba.

create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.rate_limits enable row level security;

-- Para la limpieza oportunista de abajo.
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

/**
 * Registra un intento y dice si se permite (true) o si excede el límite
 * (false). Ventana fija: el primer intento arranca la ventana y, al expirar,
 * el contador se reinicia.
 *
 * Es una función y no un select+update desde el código a propósito: leer y
 * escribir por separado deja una carrera por la que N peticiones simultáneas
 * leen el mismo contador y todas pasan — justo el escenario de un ataque.
 * Aquí el upsert es una sola sentencia atómica.
 */
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
as $$
declare
  v_count integer;
  v_expired boolean;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start
        end
  returning rl.count into v_count;

  -- Limpieza oportunista (~1 de cada 100 llamadas): sin esto la tabla crece
  -- una fila por IP para siempre. No hace falta un cron para algo así.
  select random() < 0.01 into v_expired;
  if v_expired then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_limit;
end;
$$;
