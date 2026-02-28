-- =========================================
-- EXTENSIONS
-- =========================================
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- =========================================
-- ROOMS
-- =========================================
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active', -- active | closed
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

-- =========================================
-- MEMBERS
-- =========================================
create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- =========================================
-- MESSAGES
-- =========================================
create table if not exists public.chat_room_messages (
  id bigserial primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_room_messages_room_time
  on public.chat_room_messages(room_id, created_at);

-- =========================================
-- REALTIME PUBLICATION
-- =========================================
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_rooms';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_members'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_room_members';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_room_messages';
  end if;
end
$$;

-- =========================================
-- RLS
-- =========================================
alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;
alter table public.chat_room_messages enable row level security;

create policy "rooms select if member"
on public.chat_rooms
for select
using (
  exists (
    select 1 from public.chat_room_members m
    where m.room_id = chat_rooms.id
    and m.user_id = auth.uid()
  )
);

create policy "members select if member"
on public.chat_room_members
for select
using (
  exists (
    select 1 from public.chat_room_members m
    where m.room_id = chat_room_members.room_id
    and m.user_id = auth.uid()
  )
);

create policy "messages select if member"
on public.chat_room_messages
for select
using (
  exists (
    select 1 from public.chat_room_members m
    where m.room_id = chat_room_messages.room_id
    and m.user_id = auth.uid()
  )
);

create policy "messages insert if member"
on public.chat_room_messages
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.chat_room_members m
    where m.room_id = chat_room_messages.room_id
    and m.user_id = auth.uid()
  )
);

-- =========================================
-- MATCH ROOM FUNCTION
-- =========================================
create or replace function public.match_room()
returns uuid
language plpgsql
security definer
as $$
declare
  v_room uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select m.room_id into v_room
  from public.chat_room_members m
  join public.chat_rooms r on r.id = m.room_id
  where m.user_id = v_uid and r.status = 'active'
  limit 1;

  if v_room is not null then
    return v_room;
  end if;

  select r.id into v_room
  from public.chat_rooms r
  where r.status = 'active'
  and (
    select count(*) from public.chat_room_members m
    where m.room_id = r.id
  ) < 4
  order by r.created_at asc
  limit 1
  for update skip locked;

  if v_room is null then
    insert into public.chat_rooms(status)
    values ('active')
    returning id into v_room;
  end if;

  insert into public.chat_room_members(room_id, user_id)
  values (v_room, v_uid)
  on conflict do nothing;

  return v_room;
end;
$$;

revoke all on function public.match_room() from public;
grant execute on function public.match_room() to authenticated;

-- =========================================
-- ACTIVITY TRIGGER
-- =========================================
create or replace function public.touch_room_activity()
returns trigger
language plpgsql
as $$
begin
  update public.chat_rooms
  set last_activity_at = now()
  where id = new.room_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_room_activity on public.chat_room_messages;

create trigger trg_touch_room_activity
after insert on public.chat_room_messages
for each row execute function public.touch_room_activity();

-- =========================================
-- CLOSE IDLE ROOMS
-- =========================================
create or replace function public.close_idle_rooms(p_idle_minutes int default 30)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  update public.chat_rooms
  set status = 'closed'
  where status = 'active'
    and last_activity_at < now() - make_interval(mins => p_idle_minutes);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.close_idle_rooms(int) from public;
grant execute on function public.close_idle_rooms(int) to service_role;

-- =========================================
-- PURGE CLOSED ROOMS
-- =========================================
create or replace function public.purge_closed_rooms(p_keep_days int default 7)
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  delete from public.chat_rooms
  where status = 'closed'
    and last_activity_at < now() - make_interval(days => p_keep_days);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_closed_rooms(int) from public;
grant execute on function public.purge_closed_rooms(int) to service_role;

-- =========================================
-- CRON JOBS
-- =========================================
select cron.schedule(
  'close_idle_chat_rooms',
  '*/5 * * * *',
  $$select public.close_idle_rooms(30);$$
);

select cron.schedule(
  'purge_closed_chat_rooms',
  '0 4 * * *',
  $$select public.purge_closed_rooms(7);$$
);
