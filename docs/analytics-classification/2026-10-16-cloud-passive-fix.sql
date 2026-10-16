-- =============================================================================
-- 2026-10-16 — Passive cloud-infrastructure sessions must not count as qualified
-- Target: EXTERNAL analytics database (torah-by-the-table)
-- Object: public.analytics_sessions_classified (view) + helper
--         public.is_cloud_infrastructure_org(text)
--
-- STATUS: REVIEWED, EXECUTABLE — NOT EXECUTED BY LOVABLE. The owner applies it
-- separately. Idempotent: CREATE OR REPLACE only, no DROP, no row changes.
--
-- Mirrors src/lib/traffic-confidence.ts classifySession():
--   internal                                   -> 'internal'          / false
--   download_served action or interaction      -> 'qualified_human'   / true
--   known infrastructure, no deliberate action:
--     <=1 page, no human_signal, < 30 s        -> 'likely_automated'  / false
--     otherwise (incl. human_signal / dwell)   -> 'unclassified'      / false
--   other networks: human_signal, >1 page or >30 s -> 'likely_human'  / true
--   else                                       -> 'unclassified'      / NULL
--
-- Column list and order (19) are unchanged, so CREATE OR REPLACE VIEW keeps
-- the view's owner, comments and grants (service_role-only). The grant block
-- below simply re-asserts that state.
--
-- Pre-check (read-only, recommended):
--   SELECT pg_get_viewdef('public.analytics_sessions_classified'::regclass, true);
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND table_name='analytics_sessions_classified';
-- =============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Narrow, normalized matcher. Same needles as INFRASTRUCTURE_ORGANIZATIONS in
-- src/lib/traffic-confidence.ts. Deliberately NOT matched: bare "google",
-- "google fiber", "oracle corporation", consumer ISPs (e.g. Verizon Business).
CREATE OR REPLACE FUNCTION public.is_cloud_infrastructure_org(org text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    regexp_replace(lower(replace(btrim(org), ',', '')), '\s+', ' ', 'g')
      ~ ('amazon\.com|amazon technologies|amazon data services|cisco opendns|'
         || 'cloudflare|fastly|latitude\.sh|microsoft corporation|microsoft azure|'
         || 'azure cloud|google cloud|digitalocean|hetzner online|ovh sas|ovh hosting|'
         || 'ovhcloud|leaseweb|oracle cloud|oracle public cloud'),
    false)
$$;

COMMENT ON FUNCTION public.is_cloud_infrastructure_org(text) IS
  'Reporting-only: TRUE for known cloud-hosting/security AS organizations. Never used for blocking.';

REVOKE ALL ON FUNCTION public.is_cloud_infrastructure_org(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_cloud_infrastructure_org(text) TO service_role;

CREATE OR REPLACE VIEW public.analytics_sessions_classified AS
WITH s AS (
  SELECT e.session_id,
         e.visitor_id,
         min(e.occurred_at) AS started_at,
         max(e.occurred_at) AS ended_at,
         (EXTRACT(epoch FROM (max(e.occurred_at) - min(e.occurred_at))))::integer AS active_span_seconds,
         count(*) FILTER (WHERE e.event_name = 'page_view') AS page_views,
         count(*) FILTER (WHERE e.event_name = 'human_signal') AS human_signals,
         count(DISTINCT coalesce(e.metadata->>'action_id', e.id::text))
           FILTER (WHERE e.event_name = 'download_served') AS download_actions,
         count(*) FILTER (WHERE e.event_name = ANY (ARRAY['chooser_select','filter_change','search',
           'recommendation_click','publication_click','my_table_open','signup'])) AS interaction_actions,
         bool_or(coalesce(e.is_internal, false)) AS is_internal,
         max(e.as_organization) AS as_organization,
         max(e.device_type) AS device_type,
         max(e.city) AS city,
         max(e.region) AS region,
         max(e.country) AS country,
         max(e.source_group) AS source_group,
         bool_or(e.is_new_visitor) AS is_new_visitor
    FROM public.analytics_events e
   WHERE e.session_id IS NOT NULL
   GROUP BY e.session_id, e.visitor_id
)
SELECT session_id, visitor_id, started_at, ended_at, active_span_seconds,
       page_views, human_signals, download_actions, interaction_actions,
       is_internal, as_organization, device_type, city, region, country,
       source_group, is_new_visitor,
       CASE
         WHEN is_internal THEN 'internal'
         WHEN download_actions > 0 OR interaction_actions > 0 THEN 'qualified_human'
         WHEN public.is_cloud_infrastructure_org(as_organization)
              AND page_views <= 1 AND human_signals = 0 AND active_span_seconds < 30
           THEN 'likely_automated'
         WHEN public.is_cloud_infrastructure_org(as_organization) THEN 'unclassified'
         WHEN human_signals > 0 OR page_views > 1 OR active_span_seconds > 30 THEN 'likely_human'
         ELSE 'unclassified'
       END AS traffic_class,
       CASE
         WHEN is_internal THEN false
         WHEN download_actions > 0 OR interaction_actions > 0 THEN true
         WHEN public.is_cloud_infrastructure_org(as_organization) THEN false
         WHEN human_signals > 0 OR page_views > 1 OR active_span_seconds > 30 THEN true
         ELSE NULL::boolean
       END AS counts_as_qualified_visitor
  FROM s;

-- Re-assert service_role-only access (no-op if already so).
REVOKE ALL ON public.analytics_sessions_classified FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.analytics_sessions_classified TO service_role;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verification (read-only)
--   SELECT traffic_class, counts_as_qualified_visitor, count(*)
--     FROM public.analytics_sessions_classified
--    WHERE public.is_cloud_infrastructure_org(as_organization)
--      AND started_at > now() - interval '1 day'
--    GROUP BY 1, 2;
--   -- Expect no TRUE row unless interaction_actions > 0 OR download_actions > 0.
--   SELECT public.is_cloud_infrastructure_org('Microsoft Azure Cloud (westus2)'),  -- t
--          public.is_cloud_infrastructure_org('Google LLC'),                       -- f
--          public.is_cloud_infrastructure_org('Verizon Business');                 -- f
-- -----------------------------------------------------------------------------

-- =============================================================================
-- ROLLBACK (run as one block). Restores the pre-fix outer CASE, where cloud
-- sessions fell through to the generic human_signal / page / dwell rules.
-- Same 19 columns, same CTE, so CREATE OR REPLACE keeps grants.
-- The helper function is left in place (harmless, unused after rollback);
-- if it did not exist before, it may be removed AFTER this rollback with:
--   DROP FUNCTION public.is_cloud_infrastructure_org(text);
-- NOTE: if your saved pre-check pg_get_viewdef output differs from the block
-- below, use that saved output instead — it is the authoritative old version.
-- =============================================================================
-- BEGIN;
-- SET LOCAL lock_timeout = '5s';
-- CREATE OR REPLACE VIEW public.analytics_sessions_classified AS
-- WITH s AS (
--   SELECT e.session_id,
--          e.visitor_id,
--          min(e.occurred_at) AS started_at,
--          max(e.occurred_at) AS ended_at,
--          (EXTRACT(epoch FROM (max(e.occurred_at) - min(e.occurred_at))))::integer AS active_span_seconds,
--          count(*) FILTER (WHERE e.event_name = 'page_view') AS page_views,
--          count(*) FILTER (WHERE e.event_name = 'human_signal') AS human_signals,
--          count(DISTINCT coalesce(e.metadata->>'action_id', e.id::text))
--            FILTER (WHERE e.event_name = 'download_served') AS download_actions,
--          count(*) FILTER (WHERE e.event_name = ANY (ARRAY['chooser_select','filter_change','search',
--            'recommendation_click','publication_click','my_table_open','signup'])) AS interaction_actions,
--          bool_or(coalesce(e.is_internal, false)) AS is_internal,
--          max(e.as_organization) AS as_organization,
--          max(e.device_type) AS device_type,
--          max(e.city) AS city,
--          max(e.region) AS region,
--          max(e.country) AS country,
--          max(e.source_group) AS source_group,
--          bool_or(e.is_new_visitor) AS is_new_visitor
--     FROM public.analytics_events e
--    WHERE e.session_id IS NOT NULL
--    GROUP BY e.session_id, e.visitor_id
-- )
-- SELECT session_id, visitor_id, started_at, ended_at, active_span_seconds,
--        page_views, human_signals, download_actions, interaction_actions,
--        is_internal, as_organization, device_type, city, region, country,
--        source_group, is_new_visitor,
--        CASE
--          WHEN is_internal THEN 'internal'
--          WHEN download_actions > 0 OR interaction_actions > 0 THEN 'qualified_human'
--          WHEN public.is_cloud_infrastructure_org(as_organization)
--               AND page_views <= 1 AND human_signals = 0 AND active_span_seconds < 30
--            THEN 'likely_automated'
--          WHEN human_signals > 0 OR page_views > 1 OR active_span_seconds > 30 THEN 'likely_human'
--          ELSE 'unclassified'
--        END AS traffic_class,
--        CASE
--          WHEN is_internal THEN false
--          WHEN download_actions > 0 OR interaction_actions > 0 THEN true
--          WHEN public.is_cloud_infrastructure_org(as_organization)
--               AND page_views <= 1 AND human_signals = 0 AND active_span_seconds < 30
--            THEN false
--          WHEN human_signals > 0 OR page_views > 1 OR active_span_seconds > 30 THEN true
--          ELSE NULL::boolean
--        END AS counts_as_qualified_visitor
--   FROM s;
-- REVOKE ALL ON public.analytics_sessions_classified FROM PUBLIC, anon, authenticated;
-- GRANT SELECT ON public.analytics_sessions_classified TO service_role;
-- COMMIT;
