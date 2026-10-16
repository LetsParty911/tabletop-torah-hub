-- 2026-10-16: Canonical report-only correction for passive same-page traffic.
-- No event rows are removed; no block, VPN, Shabbos or city policy is changed.
-- Keep the established Des Moines/Microsoft reporting exclusion.
-- Preserve the existing 19 output columns and service-role-only view grants.
-- On infrastructure, passive dwell or human_signal without intent is not enough.
-- A server-only download_served redirect is audit evidence, not proof of a user action.
CREATE OR REPLACE VIEW public.analytics_sessions_classified AS
WITH s AS (
  SELECT
    e.session_id,
    e.visitor_id,
    min(e.occurred_at) AS started_at,
    max(e.occurred_at) AS ended_at,
    extract(epoch FROM (max(e.occurred_at) - min(e.occurred_at)))::integer AS active_span_seconds,
    count(*) FILTER (WHERE e.event_name = 'page_view') AS page_views,
    count(DISTINCT nullif(btrim(e.path), ''))
      FILTER (WHERE e.event_name = 'page_view') AS distinct_page_paths,
    count(*) FILTER (WHERE e.event_name = 'publication_impression') AS impressions,
    count(*) FILTER (WHERE e.event_name = 'human_signal') AS human_signals,
    count(DISTINCT coalesce(e.metadata->>'action_id', e.id::text))
      FILTER (WHERE e.event_name = 'download_served') AS download_actions,
    count(*) FILTER (WHERE e.event_name = ANY (ARRAY[
      'download','publication_click','filter_change','search','share_click',
      'signup','print_click','chooser_select','recommendation_click',
      'my_table_add','my_table_remove','my_table_open'
    ])) AS interaction_actions,
    bool_or(coalesce(e.is_internal,false)) AS is_internal,
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
SELECT
  session_id,visitor_id,started_at,ended_at,active_span_seconds,
  page_views,human_signals,download_actions,interaction_actions,
  is_internal,as_organization,device_type,city,region,country,
  source_group,is_new_visitor,
  CASE
    WHEN is_internal THEN 'internal'
    WHEN lower(coalesce(city,''))='des moines'
      AND lower(coalesce(region,''))='iowa'
      AND upper(coalesce(country,''))='US'
      AND as_organization='Microsoft Corporation' THEN 'likely_automated'
    WHEN interaction_actions > 0 THEN 'qualified_human'
    WHEN public.is_cloud_infrastructure_org(as_organization)
      AND page_views <= 1 AND human_signals = 0 AND impressions = 0
      AND active_span_seconds < 30 THEN 'likely_automated'
    WHEN public.is_cloud_infrastructure_org(as_organization) THEN 'unclassified'
    WHEN human_signals > 0 THEN 'likely_human'
    WHEN distinct_page_paths >= 3 AND active_span_seconds >= 30 THEN 'likely_human'
    WHEN distinct_page_paths >= 2 AND impressions > 0
      AND active_span_seconds >= 10 THEN 'likely_human'
    ELSE 'unclassified'
  END AS traffic_class,
  CASE
    WHEN is_internal THEN false
    WHEN lower(coalesce(city,''))='des moines'
      AND lower(coalesce(region,''))='iowa'
      AND upper(coalesce(country,''))='US'
      AND as_organization='Microsoft Corporation' THEN false
    WHEN interaction_actions > 0 THEN true
    WHEN public.is_cloud_infrastructure_org(as_organization) THEN false
    WHEN human_signals > 0 THEN true
    WHEN distinct_page_paths >= 3 AND active_span_seconds >= 30 THEN true
    WHEN distinct_page_paths >= 2 AND impressions > 0
      AND active_span_seconds >= 10 THEN true
    ELSE NULL::boolean
  END AS counts_as_qualified_visitor
FROM s;

-- Existing ACL is retained by CREATE OR REPLACE; re-assert no anonymous access.
REVOKE ALL ON public.analytics_sessions_classified FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.analytics_sessions_classified TO service_role;

-- Read-only post-deployment checks:
-- SELECT city,as_organization,traffic_class,counts_as_qualified_visitor,count(*)
-- FROM public.analytics_sessions_classified
-- WHERE started_at >= now() - interval '14 days'
--   AND (city='Paris' OR city='Washington')
-- GROUP BY 1,2,3,4 ORDER BY city,count(*) DESC;
