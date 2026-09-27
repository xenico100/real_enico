-- Keep privileged lookup out of the exposed API schema.
grant usage on schema private to anon, authenticated;
create function private.is_enico_owner()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt()->>'is_anonymous')::boolean, true) is false
    and exists (select 1 from private.enico_site_owner where user_id = auth.uid());
$$;
revoke all on function private.is_enico_owner() from public;
grant execute on function private.is_enico_owner() to anon, authenticated, service_role;
create or replace function public.is_primary_admin()
returns boolean language sql stable security invoker
set search_path = pg_catalog, public
as $$ select private.is_enico_owner(); $$;
notify pgrst, 'reload schema';
