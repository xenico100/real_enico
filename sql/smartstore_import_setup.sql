create extension if not exists pgcrypto;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  source text default 'smartstore',
  smartstore_channel_product_no bigint unique,
  title text,
  price integer,
  currency text default 'KRW',
  status text,
  thumbnail_url text,
  images jsonb default '[]'::jsonb,
  detail_html text,
  raw jsonb,
  category_id uuid references public.product_categories(id),
  category_name_raw text,
  synced_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.app_flags (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.products
  add column if not exists currency text default 'KRW',
  add column if not exists status text,
  add column if not exists category_id uuid references public.product_categories(id),
  add column if not exists category_name_raw text,
  add column if not exists updated_at timestamptz default now();

create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_synced_at_idx on public.products(synced_at desc);

