-- =============================================================================
-- 2026-10-16 — Passive cloud-infrastructure sessions must not count as qualified
-- Target: EXTERNAL analytics database (torah-by-the-table), view
--         public.analytics_sessions_classified
--
-- STATUS: REVIEWED DRAFT — NOT EXECUTED BY LOVABLE. Lovable only has REST row
-- access to this database; the view body could not be read, only its column
-- list (verified via the REST schema on 2026-10-16):
--   session_id, visitor_id, started_at, ended_at, active_span_seconds,
--   page_views, human_signals, download_actions, interaction_actions,
--   is_internal, as_organization, device_type, city, region, country,
--   source_group, is_new_visitor, traffic_class, counts_as_qualified_visitor
--
-- Mirrors src/lib/traffic-confidence.ts classifySession():
--   internal -> internal
--   explicit interaction / download -> qualified (protects cloud networks too)
--   known infrastructure, no deliberate action:
--       1 page, < 30 s, no human_signal -> likely_automated
--       otherwise                       -> unclassified
--     counts_as_qualified_visitor = FALSE in both cases
--   then the EXISTING generic human_signal / pages / dwell rules (unchanged).
--
-- No DROP. No rows touched. CREATE OR REPLACE VIEW keeps column names, order,
-- types, owner and grants.
--
-- ---------------------------------------------------------------------------
-- STEP 0 (REQUIRED, before running): save the current definition for rollback
--   SELECT pg_get_viewdef('public.analytics_sessions_classified'::regclass, true);
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='analytics_sessions_classified';
-- Store both outputs. ROLLBACK = run
--   CREATE OR REPLACE VIEW public.analytics_sessions_classified AS <saved body>;
-- (and DROP FUNCTION public.is_cloud_infrastructure_org(text) only after the
--  view no longer references it).
-- ---------------------------------------------------------------------------
-- STEP 1: narrow, normalized matcher (same needles as the TypeScript list).
-- ---------------------------------------------------------------------------
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.is_cloud_infrastructure_org(org text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce(
    regexp_replace(lower(replace(trim(org), ',', '')), '\s+', ' ', 'g') ~ (
      'amazon\.com|amazon technologies|amazon data services|cisco opendns|'
      || 'cloudflare|fastly|latitude\.sh|microsoft corporation|microsoft azure|'
      || 'azure cloud|google cloud|digitalocean|hetzner online|ovh sas|ovh hosting|'
      || 'ovhcloud|leaseweb|oracle cloud|oracle public cloud'
    ),
    false)
$$;
-- Deliberately NOT matched: bare "google", "oracle corporation", consumer ISPs.

-- ---------------------------------------------------------------------------
-- STEP 2: replace ONLY the traffic_class / counts_as_qualified_visitor CASE
-- expressions in the saved STEP 0 body. Everything above the final SELECT
-- (CTEs/aggregation) must be copied verbatim from pg_get_viewdef output.
-- Wrap the existing body as `base` and apply the rule on top, keeping the
-- exact column order. Replace <EXISTING_VIEW_BODY> before running; the
-- statement intentionally fails if left unedited.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.analytics_sessions_classified AS
WITH base AS (
  <EXISTING_VIEW_BODY>   -- paste the STEP 0 SELECT here, unchanged
), ruled AS (
  SELECT b.*,
    CASE
      WHEN coalesce(b.is_internal, false) THEN NULL                 -- keep existing
      WHEN coalesce(b.interaction_actions, 0) > 0
        OR coalesce(b.download_actions, 0) > 0 THEN NULL            -- keep existing
      WHEN public.is_cloud_infrastructure_org(b.as_organization) THEN
        CASE
          WHEN coalesce(b.page_views, 0) <= 1
           AND coalesce(b.human_signals, 0) = 0
           AND coalesce(b.active_span_seconds, 0) < 30 THEN 'likely_automated'
          ELSE 'unclassified'
        END
      ELSE NULL                                                     -- keep existing
    END AS infra_override
  FROM base b
)
SELECT
  session_id, visitor_id, started_at, ended_at, active_span_seconds,
  page_views, human_signals, download_actions, interaction_actions,
  is_internal, as_organization, device_type, city, region, country,
  source_group, is_new_visitor,
  coalesce(infra_override, traffic_class)                         AS traffic_class,
  CASE WHEN infra_override IS NOT NULL THEN false
       ELSE counts_as_qualified_visitor END                       AS counts_as_qualified_visitor
FROM ruled;

-- Re-apply the grants captured in STEP 0 if your Postgres version reset them
-- (CREATE OR REPLACE normally preserves them). Example only:
-- GRANT SELECT ON public.analytics_sessions_classified TO service_role;

COMMIT;

-- ---------------------------------------------------------------------------
-- STEP 3: verification (read-only)
--   SELECT traffic_class, counts_as_qualified_visitor, count(*)
--     FROM public.analytics_sessions_classified
--    WHERE public.is_cloud_infrastructure_org(as_organization)
--      AND started_at > now() - interval '1 day'
--    GROUP BY 1,2;
--   -- Expect: no qualified row with interaction_actions = 0 AND download_actions = 0.
-- =============================================================================
