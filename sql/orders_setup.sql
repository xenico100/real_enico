create extension if not exists pgcrypto;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null,
  channel text not null check (channel in ('member', 'guest')),
  payment_method text not null check (payment_method in ('bank_transfer', 'paypal')),
  payment_status text not null,
  currency text not null default 'KRW',
  amount_subtotal bigint not null default 0,
  amount_shipping bigint not null default 0,
  amount_tax bigint not null default 0,
  amount_total bigint not null default 0,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  customer_country text not null,
  customer_address text not null,
  bank_name text,
  bank_account_number text,
  paypal_order_id text,
  paypal_capture_id text,
  paypal_currency text,
  paypal_value text,
  items jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_order_code_idx on public.orders (order_code);
