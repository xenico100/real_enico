-- Keep a second owner-only boundary even if a future migration accidentally
-- restores browser write grants or adds another permissive catalog policy.
create policy owner_only_products_insert on public.products as restrictive for insert to authenticated
  with check ((select public.is_primary_admin()));
create policy owner_only_products_update on public.products as restrictive for update to authenticated
  using ((select public.is_primary_admin())) with check ((select public.is_primary_admin()));
create policy owner_only_products_delete on public.products as restrictive for delete to authenticated
  using ((select public.is_primary_admin()));

create policy owner_only_collections_insert on public.collections as restrictive for insert to authenticated
  with check ((select public.is_primary_admin()));
create policy owner_only_collections_update on public.collections as restrictive for update to authenticated
  using ((select public.is_primary_admin())) with check ((select public.is_primary_admin()));
create policy owner_only_collections_delete on public.collections as restrictive for delete to authenticated
  using ((select public.is_primary_admin()));
