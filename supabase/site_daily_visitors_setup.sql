create table if not exists public.site_daily_visitors (
  visit_date date not null,
  visitor_id text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_path text,
  hit_count integer not null default 1,
  primary key (visit_date, visitor_id)
);

create index if not exists idx_site_daily_visitors_last_seen
  on public.site_daily_visitors(last_seen_at desc);

create index if not exists idx_site_daily_visitors_visit_date
  on public.site_daily_visitors(visit_date);
