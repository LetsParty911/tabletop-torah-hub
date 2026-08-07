create extension if not exists "pgcrypto";

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  referrer text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  session_id text not null,
  visitor_id text not null,
  is_new_visitor boolean not null default false,
  device_type text,
  city text,
  region text,
  country text,
  timezone text,
  created_at timestamptz not null default now()
);

create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
create index if not exists page_views_path_idx on public.page_views (path);
create index if not exists page_views_utm_source_idx on public.page_views (utm_source);

grant all on public.page_views to service_role;
alter table public.page_views enable row level security;

create table if not exists public.search_events (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  result_count integer not null default 0,
  session_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists search_events_created_at_idx on public.search_events (created_at desc);

grant all on public.search_events to service_role;
alter table public.search_events enable row level security;