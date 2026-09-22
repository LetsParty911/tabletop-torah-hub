-- =====================================================================
-- Migration: geolocation provider + network metadata + reliability label
-- Run this in the external analytics Supabase project (the same project
-- reached by getSupabaseAdmin() / EXT_SUPABASE_URL).
--
-- Safe to re-run (idempotent). No historical rows are modified or backfilled.
-- Latitude/longitude is never stored.
-- =====================================================================

-- 1) Detailed network metadata lives on the per-IP cache so repeat events do
--    not duplicate it. Booleans are nullable: NULL means "provider did not say".
alter table public.ip_geo_cache add column if not exists provider text;          -- edge | ipwhois | maxmind | none
alter table public.ip_geo_cache add column if not exists asn bigint;
alter table public.ip_geo_cache add column if not exists as_organization text;
alter table public.ip_geo_cache add column if not exists isp text;
alter table public.ip_geo_cache add column if not exists is_mobile boolean;
alter table public.ip_geo_cache add column if not exists is_vpn boolean;
alter table public.ip_geo_cache add column if not exists is_proxy boolean;
alter table public.ip_geo_cache add column if not exists is_tor boolean;
alter table public.ip_geo_cache add column if not exists is_hosting boolean;
alter table public.ip_geo_cache add column if not exists is_relay boolean;

-- 2) Canonical events keep only the concise, reportable values.
--    geo_source semantics are unchanged: edge | ip_lookup | country_only.
alter table public.analytics_events add column if not exists geo_provider text;     -- edge | ipwhois | maxmind | none
alter table public.analytics_events add column if not exists geo_reliability text;  -- low | medium | unknown
alter table public.analytics_events add column if not exists network_type text;     -- mobile|vpn|proxy|tor|hosting|relay|standard|unknown

create index if not exists analytics_events_geo_reliability_idx
  on public.analytics_events (geo_reliability)
  where geo_reliability is not null;

-- 3) Legacy page_views stays compatible; analytics_events remains the
--    canonical source of truth. Nothing to change there.
