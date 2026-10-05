-- Once a provider capture/approval may have started, automatic expiry is not
-- safe: the provider can have moved money despite a lost HTTP response.
-- Such claims remain until known-success inventory sync or manual reconciliation.
alter table public.payment_checkout_claims
  add column if not exists provider_attempt_started boolean not null default false;

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
  v_product jsonb;
  v_raw jsonb;
  v_inventory_key text;
  v_inventory_value text;
  v_provider_attempt boolean;
begin
  if p_order_code is null or p_order_code !~ '^[A-Za-z0-9_-]{6,64}$'
     or p_payment_method not in ('paypal', 'nicepay')
     or p_payment_method is null or p_product_ids is null
     or cardinality(p_product_ids) > 20 or p_hold_seconds is null
     or p_hold_seconds not between 60 and 86400 then
    raise exception 'invalid checkout claim' using errcode = '22023';
  end if;

  -- The application uses 1800 for an unapproved NICE checkout and 86400 for
  -- a provider attempt. The latter is deliberately held until reconciliation.
  v_provider_attempt := p_hold_seconds = 86400;

  for v_product_id in
    select distinct product_id from unnest(p_product_ids) as identifiers(product_id) order by product_id
  loop
    select p.is_published, to_jsonb(p) into v_published, v_product
    from public.products p
    where p.id = v_product_id
    for update;

    if not found or v_published is distinct from true then
      raise exception 'checkout product unavailable' using errcode = 'P0001';
    end if;

    v_raw := coalesce(v_product->'raw', '{}'::jsonb);
    if jsonb_typeof(v_raw) = 'object' then
      if lower(coalesce(v_raw->>'sold_out', '')) in
           ('true', 'yes', 'soldout', 'sold_out', 'out_of_stock', '0')
         or lower(coalesce(v_raw->>'soldOut', '')) in
           ('true', 'yes', 'soldout', 'sold_out', 'out_of_stock', '0')
         or lower(coalesce(v_raw->>'status', '')) in
           ('soldout', 'sold_out', 'out_of_stock') then
        raise exception 'checkout product unavailable' using errcode = 'P0001';
      end if;

      foreach v_inventory_key in array array['stock', 'inventory', 'quantity'] loop
        v_inventory_value := v_raw->>v_inventory_key;
        if v_inventory_value = '0' then
          raise exception 'checkout product unavailable' using errcode = 'P0001';
        end if;
        if jsonb_typeof(v_raw->v_inventory_key) = 'number' then
          if v_inventory_value::numeric <= 0 then
            raise exception 'checkout product unavailable' using errcode = 'P0001';
          end if;
        end if;
      end loop;
    end if;

    insert into public.payment_checkout_claims
      (product_id, order_code, payment_method, expires_at, provider_attempt_started)
    values
      (v_product_id, p_order_code, p_payment_method,
       case when v_provider_attempt then 'infinity'::timestamptz
            else now() + make_interval(secs => p_hold_seconds) end,
       v_provider_attempt)
    on conflict (product_id) do update
      set order_code = excluded.order_code,
          payment_method = excluded.payment_method,
          provider_attempt_started =
            public.payment_checkout_claims.provider_attempt_started or excluded.provider_attempt_started,
          expires_at =
            case when public.payment_checkout_claims.provider_attempt_started
                      or excluded.provider_attempt_started
                 then 'infinity'::timestamptz
                 else excluded.expires_at end,
          updated_at = now()
      where (public.payment_checkout_claims.expires_at <= now()
             and not public.payment_checkout_claims.provider_attempt_started)
         or (public.payment_checkout_claims.order_code = excluded.order_code
             and public.payment_checkout_claims.payment_method = excluded.payment_method);

    if not found then
      raise exception 'checkout product already claimed' using errcode = 'P0001';
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.claim_checkout_products(text, text, uuid[], integer) from public, anon, authenticated;
grant execute on function public.claim_checkout_products(text, text, uuid[], integer) to service_role;
