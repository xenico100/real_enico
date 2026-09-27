-- Bind ownership to the existing confirmed account, never to a reusable email.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.enico_site_owner (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.enico_site_owner enable row level security;
revoke all on private.enico_site_owner from public, anon, authenticated;
do $$
begin
  if (select count(*) from auth.users where lower(email) = 'morba9850@gmail.com'
      and email_confirmed_at is not null and is_anonymous is false) <> 1 then
    raise exception 'Confirmed Enico owner could not be uniquely verified';
  end if;
end $$;
insert into private.enico_site_owner(user_id)
select id from auth.users where lower(email) = 'morba9850@gmail.com'
  and email_confirmed_at is not null and is_anonymous is false;

create or replace function public.is_primary_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, true) is false
    and exists (select 1 from private.enico_site_owner where user_id = auth.uid());
$$;
revoke all on function public.is_primary_admin() from public;
grant execute on function public.is_primary_admin() to anon, authenticated, service_role;

-- Existing catalog rules also permit entries in admins; require owner for writes.
create policy owner_only_admins on public.admins as restrictive for all to authenticated
  using ((select public.is_primary_admin())) with check ((select public.is_primary_admin()));
create policy owner_only_products_insert on public.products as restrictive for insert to authenticated
  with check ((select public.is_primary_admin()));
create policy owner_only_products_update on public.products as restrictive for update to authenticated
  using ((select public.is_primary_admin())) with check ((select public.is_primary_admin()));
create policy owner_only_products_delete on public.products as restrictive for delete to authenticated
  using ((select public.is_primary_admin()));

-- Persistent atomic budgets shared across Vercel instances. No raw IPs/phones.
create table private.request_budgets (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  hits integer not null,
  reset_at timestamptz not null
);
create index request_budgets_expiry on private.request_budgets(reset_at);
alter table private.request_budgets enable row level security;
revoke all on private.request_budgets from public, anon, authenticated;

create function public.consume_request_budget(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_hits integer; v_now timestamptz := clock_timestamp();
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$'
    or p_limit is null or p_limit not between 1 and 1000
    or p_seconds is null or p_seconds not between 1 and 86400 then
    raise exception 'Invalid budget arguments';
  end if;
  insert into private.request_budgets as b (key, hits, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_seconds))
  on conflict (key) do update set
    hits = case when b.reset_at <= v_now then 1 else b.hits + 1 end,
    reset_at = case when b.reset_at <= v_now then excluded.reset_at else b.reset_at end
  where b.reset_at <= v_now or b.hits < p_limit
  returning hits into v_hits;
  delete from private.request_budgets where key in (
    select key from private.request_budgets where reset_at < v_now - interval '1 day' limit 50
  );
  return v_hits is not null and v_hits <= p_limit;
end $$;
revoke all on function public.consume_request_budget(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_request_budget(text, integer, integer) to service_role;
notify pgrst, 'reload schema';
