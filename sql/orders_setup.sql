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
  guest_order_number text,
  guest_password_hash text,
  shipping_status text not null default 'preparing' check (shipping_status in ('preparing', 'shipping', 'delivered')),
  shipping_company text,
  tracking_number text,
  shipping_note text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  items jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists guest_order_number text,
  add column if not exists guest_password_hash text,
  add column if not exists shipping_status text not null default 'preparing',
  add column if not exists shipping_company text,
  add column if not exists tracking_number text,
  add column if not exists shipping_note text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz;

update public.orders
set shipping_status = 'preparing'
where shipping_status is null;

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_order_code_idx on public.orders (order_code);
create unique index if not exists orders_guest_order_number_uidx on public.orders (guest_order_number);
