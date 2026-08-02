-- Gastos fijos (pagos recurrentes) con control mensual
--
-- Distinto de budgets: un presupuesto es un techo de gasto por categoría;
-- un gasto fijo es un pago concreto que se repite cada mes (alquiler, Netflix,
-- la luz) y del que quieres saber si ya lo pagaste este mes.

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  amount numeric(12, 2), -- costo esperado (opcional: algunos varían)
  currency text not null default 'DOP',
  category text,
  due_day int check (due_day between 1 and 31), -- día de pago (opcional)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists recurring_expenses_user_idx on public.recurring_expenses (user_id);

alter table public.recurring_expenses enable row level security;

-- Estado de pago POR MES. Solo existe una fila cuando el usuario marca algo a
-- mano (override): sin fila, el estado se auto-detecta buscando una
-- transacción que cuadre en el mes. `status='pending'` sirve para deshacer un
-- auto-match equivocado; `status='paid'` para marcar pagado algo que Peso no
-- detectó (p. ej. un pago en efectivo).
create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  recurring_id uuid not null references public.recurring_expenses (id) on delete cascade,
  month date not null, -- primer día del mes, "2026-08-01"
  status text not null check (status in ('paid', 'pending')),
  transaction_id uuid references public.transactions (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (recurring_id, month)
);

create index if not exists recurring_payments_user_month_idx
  on public.recurring_payments (user_id, month);

alter table public.recurring_payments enable row level security;
