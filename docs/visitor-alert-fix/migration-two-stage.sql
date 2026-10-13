-- TWO-STAGE VISITOR ALERTS — STAGED, NOT APPLIED.
-- Target: the EXTERNAL analytics project, which serves BOTH preview and production.
-- Applying this file is therefore a LIVE change; it needs separate owner approval.
-- Additive only: no analytics_events rows are changed or deleted, no webhook is
-- created, and nothing here can send a notification. The existing
-- queue_visitor_alert() trigger, visitor_alert_queue and current visitor-alert
-- function are untouched (they keep sending the immediate first-load alert).

begin;

-- 1. Durable idempotency ledger: one row per (session, stage).
create table if not exists public.visitor_notification_log (
  session_id  text not null,
  stage       text not null check (stage in ('unconfirmed','engaged')),
  status      text not null default 'sending' check (status in ('sending','sent','failed','dry_run')),
  attempts    integer not null default 1,
  detail      text,
  claimed_at  timestamptz not null default now(),
  finished_at timestamptz,
  primary key (session_id, stage)
);
alter table public.visitor_notification_log enable row level security;
revoke all on public.visitor_notification_log from public, anon, authenticated;
grant all on public.visitor_notification_log to service_role;

-- Atomic claim. Winner = first insert, or re-claim of a 'failed' row, or of a
-- 'sending' row stuck > 10 min (crashed worker). Never re-claims 'sent'/'dry_run'.
create or replace function public.claim_visitor_notification(p_session_id text, p_stage text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare won boolean := false;
begin
  insert into public.visitor_notification_log (session_id, stage)
  values (p_session_id, p_stage)
  on conflict (session_id, stage) do update
    set status = 'sending', attempts = public.visitor_notification_log.attempts + 1,
        claimed_at = now(), finished_at = null, detail = null
    where public.visitor_notification_log.status = 'failed'
       or (public.visitor_notification_log.status = 'sending'
           and public.visitor_notification_log.claimed_at < now() - interval '10 minutes')
  returning true into won;
  return coalesce(won, false);
end $$;

create or replace function public.finish_visitor_notification(p_session_id text, p_stage text, p_status text, p_detail text)
returns void language sql security definer set search_path = '' as $$
  update public.visitor_notification_log
     set status = p_status, detail = left(p_detail, 200), finished_at = now()
   where session_id = p_session_id and stage = p_stage;
$$;
revoke all on function public.claim_visitor_notification(text, text) from public, anon, authenticated;
revoke all on function public.finish_visitor_notification(text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_visitor_notification(text, text) to service_role;
grant execute on function public.finish_visitor_notification(text, text, text, text) to service_role;

-- 2. Extend the existing shadow engaged queue (already installed, record-only).
alter table public.engaged_visitor_alert_queue
  add column if not exists trigger_action text,
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

-- 3. Trigger allowlist = dashboard MEANINGFUL_INTENT. Passive pdf_open, heartbeat,
--    scroll, human_signal and server download_served never qualify.
--    Attribution comes from the session's FIRST page_view so Shul Poster sessions
--    keep their original campaign even if the action row lacks UTM tags.
create or replace function public.queue_engaged_visitor_alert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare fp record;
begin
  if new.session_id is null
     or coalesce(new.is_internal, false)
     or new.event_name not in (
       'download','publication_click','filter_change','search','share_click','signup',
       'print_click','chooser_select','recommendation_click',
       'my_table_add','my_table_remove','my_table_open')
     or coalesce(new.referrer_host, '') ~* '(^|\.)(lovable\.app|lovable\.dev|lovableproject\.com)$'
     or coalesce(new.user_agent, '') ~* 'lovable'
     or lower(coalesce(new.utm_source, '')) = 'lovable'
  then
    return new;
  end if;

  select e.referrer_host, e.utm_source, e.utm_medium, e.utm_campaign, e.is_new_visitor
    into fp
    from public.analytics_events e
   where e.session_id = new.session_id and e.event_name = 'page_view'
   order by e.occurred_at asc limit 1;

  insert into public.engaged_visitor_alert_queue (
    session_id, trigger_event_id, trigger_event_name, trigger_action, visitor_id, is_new_visitor,
    is_internal, path, publication_title, device_type, city, region, country, occurred_at,
    referrer_host, utm_source, utm_medium, utm_campaign)
  values (
    new.session_id, new.event_id, new.event_name, new.metadata->>'action', new.visitor_id,
    coalesce(fp.is_new_visitor, new.is_new_visitor), false, new.path, new.publication_title,
    new.device_type, new.city, new.region, new.country, new.occurred_at,
    coalesce(fp.referrer_host, new.referrer_host), coalesce(fp.utm_source, new.utm_source),
    coalesce(fp.utm_medium, new.utm_medium), coalesce(fp.utm_campaign, new.utm_campaign))
  on conflict (session_id) do nothing;   -- first qualifying action only, race-safe
  return new;
exception when others then
  return new;  -- never block analytics ingest because of alerting
end $$;
revoke all on function public.queue_engaged_visitor_alert() from public, anon, authenticated;

commit;
