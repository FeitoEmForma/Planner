-- Feito em Forma | módulos adicionais do Planner.
-- Execute uma vez no SQL Editor do MESMO projeto Supabase do Planner.
-- Preserva todos os orçamentos existentes. Acrescenta apenas uma coluna
-- opcional para guardar o detalhamento das propostas da calculadora.

alter table public.quotes
  add column if not exists calculator_data jsonb;

create table if not exists public.studio_inventory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 150),
  type text not null default 'Filamento',
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  unit text not null default 'un',
  min_quantity numeric(14,3) not null default 0 check (min_quantity >= 0),
  cost numeric(14,2) not null default 0 check (cost >= 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.studio_finance (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 180),
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  date date not null default current_date,
  category text not null default 'Outros',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.studio_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 150),
  category text not null default 'Geral',
  material text not null default 'PLA',
  price numeric(14,2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text not null default '',
  featured boolean not null default false,
  description text not null default '',
  product_data jsonb not null default '{}'::jsonb,
  source_key text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Atualização compatível com instalações anteriores, sem apagar registros.
alter table public.studio_products add column if not exists product_data jsonb not null default '{}'::jsonb;
alter table public.studio_products add column if not exists source_key text;
alter table public.studio_products add column if not exists updated_at timestamptz not null default now();
alter table public.studio_inventory add column if not exists catalog_product_id uuid references public.studio_products(id) on delete set null;

create index if not exists studio_inventory_owner_idx on public.studio_inventory(owner_id,created_at desc);
create index if not exists studio_finance_owner_idx on public.studio_finance(owner_id,created_at desc);
create index if not exists studio_products_owner_idx on public.studio_products(owner_id,created_at desc);
-- PostgreSQL permite vários NULL em índice UNIQUE; apenas produtos vinculados possuem chave.
create unique index if not exists studio_products_owner_source_key_unique on public.studio_products(owner_id,source_key);
create unique index if not exists studio_inventory_owner_catalog_unique on public.studio_inventory(owner_id,catalog_product_id);

-- Preserva produtos que foram cadastrados no antigo catálogo independente.
-- O código atual passa a usar studio_products como fonte única.
do $$
begin
  if to_regclass('public.catalog_products') is not null then
    insert into public.studio_products
      (owner_id,name,material,description,product_data,price,category,source_key)
    select owner_id,name,coalesce(nullif(material,''),'PLA'),coalesce(description,''),
      coalesce(product_data,'{}'::jsonb),
      case when coalesce(product_data->>'prod_preco_manual','') ~ '^[0-9]+(\.[0-9]+)?$'
        then (product_data->>'prod_preco_manual')::numeric else 0 end,
      'Impressão 3D',
      lower(regexp_replace(btrim(name),'\s+',' ','g'))||'|'||lower(btrim(coalesce(nullif(material,''),'PLA')))
    from public.catalog_products
    where length(btrim(name)) between 1 and 150
    on conflict (owner_id,source_key) do nothing;
  end if;
end $$;

do $$
declare tablename text;
begin
  foreach tablename in array array['studio_inventory','studio_finance','studio_products'] loop
    execute format('alter table public.%I enable row level security',tablename);
    execute format('revoke all on public.%I from anon, authenticated',tablename);
    execute format('grant select, insert, update, delete on public.%I to authenticated',tablename);
    execute format('drop policy if exists "owner_select" on public.%I',tablename);
    execute format('drop policy if exists "owner_insert" on public.%I',tablename);
    execute format('drop policy if exists "owner_update" on public.%I',tablename);
    execute format('drop policy if exists "owner_delete" on public.%I',tablename);
    execute format('create policy "owner_select" on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',tablename);
    execute format('create policy "owner_insert" on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',tablename);
    execute format('create policy "owner_update" on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',tablename);
    execute format('create policy "owner_delete" on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)',tablename);
  end loop;
end $$;
