-- Run as the project owner. All API access uses the server service_role only.
-- No customer messages are sent until the owner pairs, tests, and enables one phone.
begin;

create table if not exists public.phone_relay_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  phone text not null check (phone ~ '^010[0-9]{8}$'),
  enabled boolean not null default false,
  created_at timestamptz not null default now(), enabled_at timestamptz,
  expires_at timestamptz not null, last_seen_at timestamptz, last_claim_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create unique index if not exists phone_relay_one_device on public.phone_relay_devices ((true)) where revoked_at is null;
create table if not exists public.phone_relay_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.phone_relay_devices(id),
  event_key text not null unique,
  kind text not null check (kind in ('customer_sms','self_test')),
  order_id uuid references public.orders(id) on delete restrict,
  event text,
  event_revision jsonb not null,
  source_event_at timestamptz not null,
  recipient_phone text check (recipient_phone is null or recipient_phone ~ '^010[0-9]{8}$'),
  recipient_hash text check (recipient_hash is null or recipient_hash ~ '^[a-f0-9]{64}$'),
  title text not null, message_text text not null,
  status text not null default 'queued' check (status in ('queued','claimed','submitted','unknown','stale')),
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  claimed_at timestamptz, claim_expires_at timestamptz, claim_token_hash text,
  acknowledged_at timestamptz,
  check ((kind='self_test' and order_id is null and event is null) or (kind='customer_sms' and order_id is not null and event in ('order_received','payment_confirmed','shipping_started','delivered','cancelled','refund_pending','refunded'))),
  check (octet_length(message_text) <= 2000),
  check (claim_token_hash is null or claim_token_hash ~ '^[a-f0-9]{64}$'),
  check (expires_at <= source_event_at + interval '30 minutes')
);
create index if not exists phone_relay_job_queue on public.phone_relay_jobs(device_id,status,created_at);
create index if not exists phone_relay_job_daily on public.phone_relay_jobs(claimed_at) where kind='customer_sms';
create index if not exists phone_relay_recipient_daily on public.phone_relay_jobs(recipient_hash,claimed_at) where kind='customer_sms';
alter table public.phone_relay_devices enable row level security;
alter table public.phone_relay_jobs enable row level security;
revoke all on public.phone_relay_devices,public.phone_relay_jobs from public,anon,authenticated;
grant select,insert,update on public.phone_relay_devices,public.phone_relay_jobs to service_role;

create or replace function public.phone_relay_normalize_phone(p_value text) returns text
language plpgsql immutable security invoker set search_path=pg_catalog,public,extensions as $$
declare v text;
begin
  if p_value is null or p_value !~ '^[+0-9[:space:]()-]+$' then return null; end if;
  v := regexp_replace(p_value,'[[:space:]()-]','','g');
  if v like '+82%' then v := '0'||regexp_replace(substr(v,4),'^0','');
  elsif v like '82%' then v := '0'||regexp_replace(substr(v,3),'^0',''); end if;
  return case when v ~ '^010[0-9]{8}$' then v else null end;
end $$;

create or replace function public.phone_relay_order_revision(p_order jsonb) returns jsonb
language sql immutable security invoker set search_path=pg_catalog,public,extensions as $$
  select jsonb_build_object(
    'paymentMethod',lower(trim(coalesce(p_order->>'payment_method',''))),
    'paymentStatus',lower(trim(coalesce(p_order->>'payment_status',''))),
    'shippingStatus',lower(trim(coalesce(p_order->>'shipping_status',''))),
    'shippingCompany',p_order->'shipping_company','trackingNumber',p_order->'tracking_number',
    'customerPhone',coalesce(p_order->>'customer_phone',''),'amountTotal',p_order->'amount_total',
    'currency',coalesce(p_order->>'currency',''),'bankName',p_order->'bank_name',
    'bankAccountNumber',p_order->'bank_account_number','items',p_order->'items',
    'refundStatus',coalesce(p_order#>>'{raw_payload,refundStatus}',''))
$$;

create or replace function public.phone_relay_current_event(p_order jsonb) returns text
language sql immutable security invoker set search_path=pg_catalog,public,extensions as $$
 select case
 when lower(trim(p_order->>'payment_status'))='refund_pending' then 'refund_pending'
 when lower(trim(p_order->>'payment_status'))='cancelled' then case when p_order#>>'{raw_payload,refundStatus}'='completed' then 'refunded' else 'cancelled' end
 when lower(trim(p_order->>'payment_method'))='bank_transfer' and lower(trim(p_order->>'payment_status'))='pending_transfer' then 'order_received'
 when lower(trim(p_order->>'payment_status')) in ('transfer_confirmed','paid','captured','completed') then
   case when lower(trim(p_order->>'shipping_status'))='delivered' then 'delivered'
        when lower(trim(p_order->>'shipping_status'))='shipping' then 'shipping_started' else 'payment_confirmed' end
 else null end
$$;

create or replace function public.phone_relay_source_time(p_order jsonb,p_key text,p_event text) returns timestamptz
language plpgsql immutable security invoker set search_path=pg_catalog,public,extensions as $$
declare v jsonb;
begin
  v := p_order#>array['raw_payload','notifications','events',split_part(p_key,':',1)];
  if v->>'event' is distinct from p_event then return null; end if;
  return (v->>'createdAt')::timestamptz;
exception when others then return null;
end $$;

-- Retain permanent unique event-key tombstones. Scrub content after terminal states;
-- deleting old jobs would permit a historical event to be queued a second time.
create or replace function public.phone_relay_replace_device(p_token_hash text,p_phone text,p_expires_at timestamptz) returns uuid
language plpgsql security invoker set search_path=pg_catalog,public,extensions as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(904022061015::bigint);
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_phone !~ '^010[0-9]{8}$' or p_expires_at > now()+interval '91 days' or p_expires_at <= now() then raise exception 'invalid_device'; end if;
  update public.phone_relay_jobs set status=case when status='claimed' then 'unknown' else 'stale' end,
    recipient_phone=null,message_text='',title='',event_revision='{}' where status in ('queued','claimed');
  update public.phone_relay_devices set enabled=false,revoked_at=now() where revoked_at is null;
  insert into public.phone_relay_devices(token_hash,phone,expires_at) values(p_token_hash,p_phone,p_expires_at) returning id into v_id;
  return v_id;
end $$;

create or replace function public.phone_relay_control(p_action text) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public,extensions as $$
declare d public.phone_relay_devices%rowtype;
begin
  perform pg_advisory_xact_lock(904022061015::bigint);
  select * into d from public.phone_relay_devices where revoked_at is null and expires_at>now() for update;
  if not found then return false; end if;
  if p_action='enable' then
    if not exists(select 1 from public.phone_relay_jobs where device_id=d.id and kind='self_test' and status='submitted')
       or exists(select 1 from public.phone_relay_jobs where device_id=d.id and status='claimed') then return false; end if;
    if not d.enabled then update public.phone_relay_devices set enabled=true,enabled_at=now() where id=d.id; end if;
    return true;
  elsif p_action in ('disable','revoke') then
    update public.phone_relay_devices set enabled=false,revoked_at=case when p_action='revoke' then now() else revoked_at end where id=d.id;
    update public.phone_relay_jobs set status=case when status='claimed' then 'unknown' else 'stale' end,
      recipient_phone=null,message_text='',title='',event_revision='{}' where device_id=d.id and status in ('queued','claimed');
    return true;
  end if;
  return false;
end $$;

create or replace function public.phone_relay_enqueue(p_kind text,p_event_key text,p_to text,p_title text,p_message text,p_order_id uuid,p_event text,p_revision jsonb,p_source_at timestamptz) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public,extensions as $$
declare d public.phone_relay_devices%rowtype; j public.phone_relay_jobs%rowtype; o jsonb; v_id uuid;
begin
  perform pg_advisory_xact_lock(904022061015::bigint);
  select * into d from public.phone_relay_devices where revoked_at is null and expires_at>now() for update;
  if not found then return jsonb_build_object('status','not_configured'); end if;
  select * into j from public.phone_relay_jobs where event_key=p_event_key;
  if found then return jsonb_build_object('status',case when j.status='queued' and j.device_id=d.id and j.expires_at>now() then 'queued' else 'already_claimed' end,'id',j.id); end if;
  if p_to !~ '^010[0-9]{8}$' or octet_length(p_message)>2000 or length(p_message)=0 or length(p_title)>180 or p_source_at>now()+interval '30 seconds' or p_source_at+interval '30 minutes'<=now() then return jsonb_build_object('status','stale'); end if;
  if p_kind='self_test' then
    if p_order_id is not null or p_event is not null or p_to<>d.phone or p_event_key !~ '^selftest:[A-Za-z0-9_-]{43}$'
      or exists(select 1 from public.phone_relay_jobs where device_id=d.id and kind='self_test' and status in ('queued','claimed'))
      or (select count(*) from public.phone_relay_jobs where kind='self_test' and created_at>now()-interval '1 hour')>=5 then return jsonb_build_object('status','stale'); end if;
  elsif p_kind='customer_sms' then
    if not d.enabled or d.enabled_at is null then return jsonb_build_object('status','not_configured'); end if;
    if p_event_key !~ '^[a-f0-9]{64}:customerSms$' or p_order_id is null or p_source_at<d.enabled_at then return jsonb_build_object('status','stale'); end if;
    select to_jsonb(orders) into o from public.orders where id=p_order_id for share;
    if o is null or public.phone_relay_current_event(o) is distinct from p_event
      or public.phone_relay_order_revision(o) is distinct from p_revision
      or public.phone_relay_normalize_phone(o->>'customer_phone') is distinct from p_to
      or public.phone_relay_source_time(o,p_event_key,p_event) is distinct from p_source_at then return jsonb_build_object('status','stale'); end if;
    -- A personal SIM relay must not become an unlimited checkout-to-SMS endpoint.
    if (select count(*) from public.phone_relay_jobs where kind='customer_sms' and created_at>now()-interval '24 hours')>=20
      or ((select count(distinct order_id) from public.phone_relay_jobs where kind='customer_sms' and recipient_hash=encode(extensions.digest(p_to,'sha256'),'hex') and created_at>now()-interval '24 hours')>=3
        and not exists(select 1 from public.phone_relay_jobs where kind='customer_sms' and recipient_hash=encode(extensions.digest(p_to,'sha256'),'hex') and order_id=p_order_id and created_at>now()-interval '24 hours'))
      or exists(select 1 from public.phone_relay_jobs where kind='customer_sms' and recipient_hash=encode(extensions.digest(p_to,'sha256'),'hex') and order_id<>p_order_id and created_at>now()-interval '60 seconds') then return jsonb_build_object('status','limited'); end if;
  else return jsonb_build_object('status','stale'); end if;
  insert into public.phone_relay_jobs(device_id,event_key,kind,order_id,event,event_revision,source_event_at,recipient_phone,recipient_hash,title,message_text,expires_at)
    values(d.id,p_event_key,p_kind,p_order_id,p_event,p_revision,p_source_at,p_to,encode(extensions.digest(p_to,'sha256'),'hex'),p_title,p_message,least(now()+interval '30 minutes',p_source_at+interval '30 minutes')) returning id into v_id;
  return jsonb_build_object('status','queued','id',v_id);
end $$;

create or replace function public.phone_relay_claim(p_device_hash text,p_claim_hash text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public,extensions as $$
declare d public.phone_relay_devices%rowtype; j public.phone_relay_jobs%rowtype; o jsonb; v_expired boolean;
begin
  perform pg_advisory_xact_lock(904022061015::bigint);
  if p_device_hash !~ '^[a-f0-9]{64}$' or p_claim_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('authorized',false); end if;
  select * into d from public.phone_relay_devices where token_hash=p_device_hash and revoked_at is null and expires_at>now() for update;
  if not found then return jsonb_build_object('authorized',false); end if;
  update public.phone_relay_devices set last_seen_at=now() where id=d.id;
  update public.phone_relay_jobs set status='stale',recipient_phone=null,message_text='',title='',event_revision='{}' where device_id=d.id and status='queued' and expires_at<=now();
  select exists(select 1 from public.phone_relay_jobs where device_id=d.id and status='claimed' and claim_expires_at<=now()) into v_expired;
  if v_expired then
    -- A lost response or interrupted shortcut may already have sent a message.
    -- Pause this device; never requeue or silently continue after an ambiguous send.
    update public.phone_relay_jobs set status='unknown',recipient_phone=null,message_text='',title='',event_revision='{}' where device_id=d.id and status='claimed' and claim_expires_at<=now();
    update public.phone_relay_devices set enabled=false where id=d.id;
    update public.phone_relay_jobs set status='stale',recipient_phone=null,message_text='',title='',event_revision='{}' where device_id=d.id and status='queued';
    return jsonb_build_object('authorized',true,'job',null);
  end if;
  if exists(select 1 from public.phone_relay_jobs where device_id=d.id and status='claimed') or d.last_claim_at>now()-interval '2 seconds' then return jsonb_build_object('authorized',true,'job',null); end if;
  for j in select * from public.phone_relay_jobs where device_id=d.id and status='queued' and (kind='self_test' or d.enabled) order by created_at,id for update loop
    if j.kind='customer_sms' then
      select to_jsonb(orders) into o from public.orders where id=j.order_id for share;
      if o is null or j.source_event_at<d.enabled_at or j.expires_at<=now()
        or public.phone_relay_current_event(o) is distinct from j.event
        or public.phone_relay_order_revision(o) is distinct from j.event_revision
        or public.phone_relay_normalize_phone(o->>'customer_phone') is distinct from j.recipient_phone
        or public.phone_relay_source_time(o,j.event_key,j.event) is distinct from j.source_event_at then
        update public.phone_relay_jobs set status='stale',recipient_phone=null,message_text='',title='',event_revision='{}' where id=j.id;
        continue;
      end if;
      if (select count(*) from public.phone_relay_jobs where kind='customer_sms' and claimed_at>now()-interval '24 hours')>=20
        or ((select count(distinct order_id) from public.phone_relay_jobs where kind='customer_sms' and recipient_hash=j.recipient_hash and claimed_at>now()-interval '24 hours')>=3
          and not exists(select 1 from public.phone_relay_jobs where kind='customer_sms' and recipient_hash=j.recipient_hash and order_id=j.order_id and claimed_at>now()-interval '24 hours'))
        or exists(select 1 from public.phone_relay_jobs where kind='customer_sms' and recipient_hash=j.recipient_hash and order_id<>j.order_id and claimed_at>now()-interval '60 seconds') then
        update public.phone_relay_jobs set status='stale',recipient_phone=null,message_text='',title='',event_revision='{}' where id=j.id;
        continue;
      end if;
    elsif j.recipient_phone is distinct from d.phone then
      update public.phone_relay_jobs set status='stale',recipient_phone=null,message_text='',title='',event_revision='{}' where id=j.id;
      continue;
    end if;
    update public.phone_relay_jobs set status='claimed',claimed_at=now(),claim_expires_at=least(expires_at,now()+interval '5 minutes'),claim_token_hash=p_claim_hash where id=j.id;
    update public.phone_relay_devices set last_claim_at=now() where id=d.id;
    return jsonb_build_object('authorized',true,'job',jsonb_build_object('id',j.id,'to',j.recipient_phone,'text',j.message_text,'title',j.title,'kind',j.kind));
  end loop;
  return jsonb_build_object('authorized',true,'job',null);
end $$;

create or replace function public.phone_relay_ack(p_device_hash text,p_job_id uuid,p_claim_hash text,p_status text) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public,extensions as $$
declare d public.phone_relay_devices%rowtype; j public.phone_relay_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(904022061015::bigint);
  select * into d from public.phone_relay_devices where token_hash=p_device_hash and revoked_at is null and expires_at>now() for update;
  if not found then return jsonb_build_object('authorized',false); end if;
  select * into j from public.phone_relay_jobs where id=p_job_id and device_id=d.id and claim_token_hash=p_claim_hash for update;
  if not found or p_status not in ('submitted','unknown') then return jsonb_build_object('authorized',true,'ok',false); end if;
  if j.status in ('submitted','unknown') then return jsonb_build_object('authorized',true,'ok',j.status=p_status,'status',j.status); end if;
  if j.status<>'claimed' then return jsonb_build_object('authorized',true,'ok',false); end if;
  -- A late successful callback cannot prove what happened before claim expiry.
  if j.claim_expires_at<=now() then p_status:='unknown'; end if;
  update public.phone_relay_jobs set status=p_status,acknowledged_at=now(),recipient_phone=null,message_text='',title='',event_revision='{}' where id=j.id;
  update public.phone_relay_devices set last_seen_at=now(),enabled=case when p_status='unknown' then false else enabled end where id=d.id;
  if p_status='unknown' then update public.phone_relay_jobs set status='stale',recipient_phone=null,message_text='',title='',event_revision='{}' where device_id=d.id and status='queued'; end if;
  return jsonb_build_object('authorized',true,'ok',true,'status',p_status);
end $$;

create or replace function public.phone_relay_cleanup() returns void
language plpgsql security invoker set search_path=pg_catalog,public,extensions as $$
begin
  perform pg_advisory_xact_lock(904022061015::bigint);
  update public.phone_relay_devices d set enabled=false where revoked_at is null and (
    expires_at<=now() or exists(select 1 from public.phone_relay_jobs j where j.device_id=d.id and j.status='claimed' and j.claim_expires_at<=now()));
  update public.phone_relay_jobs set status='unknown' where status='claimed' and claim_expires_at<=now();
  update public.phone_relay_jobs j set status='stale' where status='queued' and (expires_at<=now() or exists(
    select 1 from public.phone_relay_devices d where d.id=j.device_id and (d.revoked_at is not null or d.expires_at<=now() or (j.kind='customer_sms' and not d.enabled))));
  update public.phone_relay_jobs set recipient_phone=null,title='',message_text='',event_revision='{}'
    where status in ('submitted','unknown','stale') and (recipient_phone is not null or title<>'' or message_text<>'' or event_revision<>'{}'::jsonb);
  update public.phone_relay_jobs set recipient_hash=null where recipient_hash is not null
    and greatest(created_at,coalesce(claimed_at,created_at))<=now()-interval '24 hours';
end $$;

revoke all on function public.phone_relay_normalize_phone(text),public.phone_relay_order_revision(jsonb),public.phone_relay_current_event(jsonb),public.phone_relay_source_time(jsonb,text,text),public.phone_relay_replace_device(text,text,timestamptz),public.phone_relay_control(text),public.phone_relay_enqueue(text,text,text,text,text,uuid,text,jsonb,timestamptz),public.phone_relay_claim(text,text),public.phone_relay_ack(text,uuid,text,text),public.phone_relay_cleanup() from public,anon,authenticated;
grant execute on function public.phone_relay_normalize_phone(text),public.phone_relay_order_revision(jsonb),public.phone_relay_current_event(jsonb),public.phone_relay_source_time(jsonb,text,text),public.phone_relay_replace_device(text,text,timestamptz),public.phone_relay_control(text),public.phone_relay_enqueue(text,text,text,text,text,uuid,text,jsonb,timestamptz),public.phone_relay_claim(text,text),public.phone_relay_ack(text,uuid,text,text),public.phone_relay_cleanup() to service_role;
-- Register separately after checking pg_cron is available:
-- select cron.schedule('enico_phone_relay_cleanup','7 * * * *','select public.phone_relay_cleanup();');
commit;
