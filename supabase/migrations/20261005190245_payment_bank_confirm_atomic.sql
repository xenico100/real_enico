-- A bank transfer is confirmed by a human, but the confirmation and stock
-- transition must still be one database transaction. This does not initiate
-- or verify an actual bank transfer; the administrator must do that first.
create or replace function public.confirm_bank_transfer_order(p_order_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order record;
  v_product_id uuid;
  v_published boolean;
begin
  if p_order_id is null then
    raise exception 'invalid bank order id' using errcode = '22023';
  end if;

  select o.id, o.items, o.payment_method, o.payment_status, o.shipping_status
    into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found or v_order.payment_method is distinct from 'bank_transfer'
     or v_order.payment_status is distinct from 'pending_transfer'
     or v_order.shipping_status is distinct from 'preparing' then
    raise exception 'bank order is not pending confirmation' using errcode = 'P0001';
  end if;

  if jsonb_typeof(v_order.items) is distinct from 'array'
     or jsonb_array_length(v_order.items) not between 1 and 20 then
    raise exception 'bank order items are invalid' using errcode = '22023';
  end if;

  -- The same product-row lock order is used by claim_checkout_products.
  -- An error rolls back every stock change and the order status together.
  for v_product_id in
    select distinct (item.value->>'id')::uuid
    from jsonb_array_elements(v_order.items) as item(value)
    where (item.value->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    order by 1
  loop
    select p.is_published into v_published
    from public.products p
    where p.id = v_product_id
    for update;

    if not found or v_published is distinct from true then
      raise exception 'bank order product unavailable' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.payment_checkout_claims c
      where c.product_id = v_product_id and c.expires_at > now()
    ) then
      raise exception 'bank order product already claimed' using errcode = 'P0001';
    end if;

    update public.products
    set is_published = false
    where id = v_product_id and is_published = true;
    if not found then
      raise exception 'bank order product changed during confirmation' using errcode = 'P0001';
    end if;
  end loop;

  update public.orders
  set payment_status = 'transfer_confirmed', updated_at = now()
  where id = p_order_id and payment_method = 'bank_transfer'
    and payment_status = 'pending_transfer' and shipping_status = 'preparing';
  if not found then
    raise exception 'bank order changed during confirmation' using errcode = 'P0001';
  end if;

  return true;
end;
$$;

revoke all on function public.confirm_bank_transfer_order(uuid) from public, anon, authenticated;
grant execute on function public.confirm_bank_transfer_order(uuid) to service_role;
