-- =====================================================================
-- Migration: approximate city/state geolocation for first-party analytics
-- Run this in the "torah-by-the-table" (external) Supabase SQL editor —
-- the same project reached by getSupabaseAdmin() / EXT_SUPABASE_URL.
--
-- Safe to re-run (idempotent). No historical rows are modified.
-- Latitude/longitude is never stored.
-- =====================================================================

-- 7-day IP -> approximate location cache. One row per IP, so a repeat
-- visitor never triggers another external lookup.
create table if not exists public.ip_geo_cache (
  ip_address text primary key,
  country text,
  region text,
  city text,
  postal_code text,
  lookup_ok boolean not null default false,
  fetched_at timestamptz not null default now()
);

create index if not exists ip_geo_cache_fetched_at_idx
  on public.ip_geo_cache (fetched_at desc);

grant all on public.ip_geo_cache to service_role;
alter table public.ip_geo_cache enable row level security;
-- Server (service role) access only; no anon/authenticated policies.

-- Provenance of the stored location: 'edge' | 'ip_lookup' | 'country_only'.
alter table public.analytics_events add column if not exists geo_source text;
alter table public.page_views      add column if not exists geo_source text;
alter table public.page_views      add column if not exists postal_code text;

create index if not exists analytics_events_geo_source_idx
  on public.analytics_events (geo_source)
  where geo_source is not null;
