-- FEITO EM FORMA - PLANNER ONLINE - Supabase PostgreSQL
-- Execute este arquivo uma unica vez no SQL Editor do seu projeto Supabase.
-- Cada usuario autenticado acessa APENAS seus proprios orcamentos.
-- Importante: nao use a service_role key no site.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  client text not null,
  phone text not null default '',
  email text not null default '',
  product text not null,
  quantity integer not null default 1,
  unit_price numeric(14,2) not null default 0,
  unit_cost numeric(14,2) not null default 0,
  status text not null default 'a_fazer',
  priority text not null default 'media',
  due_date date,
  follow_up_date date,
  payment_status text not null default 'nao_informado',
  paid_amount numeric(14,2) not null default 0,
  notes text not null default '',
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_owner_code_unique unique(owner_id,code),
  constraint quotes_valid_client check (length(btrim(client)) between 1 and 100),
  constraint quotes_valid_product check (length(btrim(product)) between 1 and 180),
  constraint quotes_valid_quantity check (quantity between 1 and 1000000),
  constraint quotes_valid_prices check (unit_price >= 0 and unit_cost >= 0 and paid_amount >= 0 and paid_amount <= unit_price * quantity),
  constraint quotes_valid_status check (status in ('a_fazer','enviado','aprovado','producao','embalagem','pagamento','finalizado','standby')),
  constraint quotes_valid_priority check (priority in ('alta','media','baixa')),
  constraint quotes_valid_payment check (payment_status in ('nao_informado','pendente','parcial','pago')),
  constraint quotes_valid_history check (jsonb_typeof(history) = 'array')
);

create index if not exists quotes_owner_created_idx on public.quotes(owner_id,created_at desc);
create index if not exists quotes_owner_status_idx on public.quotes(owner_id,status);

-- O banco, e nao o navegador, controla quando o registro foi alterado.
create or replace function public.feito_planner_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists feito_planner_set_updated_at on public.quotes;
create trigger feito_planner_set_updated_at
before update on public.quotes
for each row execute function public.feito_planner_touch_updated_at();

-- RLS protege os dados mesmo se alguem descobrir a chave PUBLICAVEL no site.
alter table public.quotes enable row level security;
revoke all on table public.quotes from anon, authenticated;
grant select, insert, update, delete on table public.quotes to authenticated;

drop policy if exists "planner_select_own" on public.quotes;
drop policy if exists "planner_insert_own" on public.quotes;
drop policy if exists "planner_update_own" on public.quotes;
drop policy if exists "planner_delete_own" on public.quotes;

create policy "planner_select_own" on public.quotes
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "planner_insert_own" on public.quotes
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "planner_update_own" on public.quotes
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "planner_delete_own" on public.quotes
for delete to authenticated
using ((select auth.uid()) = owner_id);

-- Habilita eventos para sincronizacao imediata entre aparelhos.
-- Se um projeto ja usa realtime, NAO recriamos a publicacao existente.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public' and tablename='quotes'
     ) then
    execute 'alter publication supabase_realtime add table public.quotes';
  end if;
end
$$;
