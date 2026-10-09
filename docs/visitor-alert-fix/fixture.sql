-- FRESH ISOLATED DATABASE ONLY. No live connections or notification webhooks.
create role anon;
create role authenticated;
create table public.analytics_events (
  session_id text, event_id text, event_name text, metadata jsonb,
  visitor_id text, is_new_visitor boolean, is_internal boolean,
  referrer_host text, user_agent text, utm_source text, path text,
  publication_title text, device_type text, city text, region text,
  country text, occurred_at timestamptz
);
set visitor_alert_test.isolated = 'yes';
