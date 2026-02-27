create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'smartstore',
  smartstore_channel_product_no bigint unique,
  smartstore_origin_product_no bigint,
  title text,
  status text,
  price integer,
  currency text default 'KRW',
  thumbnail_url text,
  images jsonb default '[]'::jsonb,
  detail_html text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.products
  add column if not exists source text not null default 'smartstore',
  add column if not exists smartstore_channel_product_no bigint,
  add column if not exists smartstore_origin_product_no bigint,
  add column if not exists status text,
  add column if not exists thumbnail_url text,
  add column if not exists detail_html text,
  add column if not exists raw jsonb not null default '{}'::jsonb,
  add column if not exists synced_at timestamptz default now();

create unique index if not exists products_smartstore_channel_product_no_uidx
  on public.products (smartstore_channel_product_no)
  where smartstore_channel_product_no is not null;

create index if not exists products_source_idx on public.products (source);
create index if not exists products_synced_at_idx on public.products (synced_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();
