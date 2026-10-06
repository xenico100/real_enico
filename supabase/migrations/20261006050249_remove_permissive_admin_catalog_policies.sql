-- The legacy "anon_block" policies were RESTRICTIVE and already protected
-- these rows. Remove redundant policies and, more importantly, revoke browser
-- write grants so a later permissive policy cannot expose admin/catalog writes.
drop policy if exists anon_block_admins on public.admins;
drop policy if exists "admins can read" on public.admins;
drop policy if exists admins_select_self_or_primary on public.admins;

drop policy if exists anon_block_products_delete on public.products;
drop policy if exists anon_block_products_insert on public.products;
drop policy if exists anon_block_products_private_select on public.products;
drop policy if exists anon_block_products_update on public.products;
drop policy if exists "admins can delete products" on public.products;
drop policy if exists "admins can insert products" on public.products;
drop policy if exists "admins can update products" on public.products;
drop policy if exists owner_only_products_delete on public.products;
drop policy if exists owner_only_products_insert on public.products;
drop policy if exists owner_only_products_update on public.products;
drop policy if exists "public can read published products" on public.products;

drop policy if exists anon_block_collections_delete on public.collections;
drop policy if exists anon_block_collections_insert on public.collections;
drop policy if exists anon_block_collections_private_select on public.collections;
drop policy if exists anon_block_collections_update on public.collections;

-- Browser clients only read published catalog data (or private rows for the
-- fixed owner through RLS). All mutations already use server-side service role.
revoke all privileges on table public.admins from anon, authenticated;
revoke all privileges on table public.products, public.collections from anon, authenticated;
grant select on table public.products, public.collections to anon, authenticated;
