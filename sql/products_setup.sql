create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  source text default 'smartstore',
  smartstore_channel_product_no bigint unique,
  title text,
  price integer,
  thumbnail_url text,
  images jsonb default '[]'::jsonb,
  detail_html text,
  raw jsonb,
  synced_at timestamptz default now()
);
