-- One active checkout per one-of-a-kind product. The claim is acquired in the
-- database before any provider approval/capture, so concurrent API instances
-- cannot charge two customers for the same item.
create table if not exists public.payment_checkout_claims (
  product_id uuid primary key references public.products(id) on delete cascade,
  order_code text not null,
  payment_method text not null check (payment_method in ('paypal', 'nicepay')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_checkout_claims_expires_at_idx
  on public.payment_checkout_claims (expires_at);

alter table public.payment_checkout_claims enable row level security;
revoke all on public.payment_checkout_claims from anon, authenticated;
grant select, insert, update, delete on public.payment_checkout_claims to service_role;

create or replace function public.claim_checkout_products(
  p_order_code text,
  p_payment_method text,
  p_product_ids uuid[],
  p_hold_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_published boolean;
begin
  if p_order_code is null or p_order_code !~ '^[A-Za-z0-9_-]{6,64}$'
     or p_payment_method not in ('paypal', 'nicepay')
     or p_payment_method is null or p_product_ids is null
     or cardinality(p_product_ids) > 20 or p_hold_seconds is null
     or p_hold_seconds not between 60 and 86400 then
    raise exception 'invalid checkout claim' using errcode = '22023';
  end if;

  -- Lock all product rows in deterministic order. A raised exception rolls
  -- back every claim made earlier in this function call.
  for v_product_id in
    select distinct product_id from unnest(p_product_ids) as identifiers(product_id) order by product_id
  loop
    select is_published into v_published
    from public.products
    where id = v_product_id
    for update;

    if not found or v_published is distinct from true then
      raise exception 'checkout product unavailable' using errcode = 'P0001';
    end if;

    insert into public.payment_checkout_claims
      (product_id, order_code, payment_method, expires_at)
    values
      (v_product_id, p_order_code, p_payment_method, now() + make_interval(secs => p_hold_seconds))
    on conflict (product_id) do update
      set order_code = excluded.order_code,
          payment_method = excluded.payment_method,
          expires_at = excluded.expires_at,
          updated_at = now()
      where public.payment_checkout_claims.expires_at <= now()
         or (public.payment_checkout_claims.order_code = excluded.order_code
             and public.payment_checkout_claims.payment_method = excluded.payment_method);

    if not found then
      raise exception 'checkout product already claimed' using errcode = 'P0001';
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.release_checkout_products(
  p_order_code text,
  p_payment_method text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.payment_checkout_claims
  where order_code = p_order_code and payment_method = p_payment_method;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_checkout_products(text, text, uuid[], integer) from public, anon, authenticated;
revoke all on function public.release_checkout_products(text, text) from public, anon, authenticated;
grant execute on function public.claim_checkout_products(text, text, uuid[], integer) to service_role;
grant execute on function public.release_checkout_products(text, text) to service_role;
