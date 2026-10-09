-- STAGED — NOT APPLIED. Engagement-qualified visitor alerts.
-- Run manually in the EXTERNAL analytics project only after owner approval.
-- Additive: no analytics_events rows are changed or deleted; the existing
-- queue_visitor_alert() trigger and visitor_alert_queue table are left intact
-- (they keep recording raw unverified first page views for diagnostics).
-- The database webhook is repointed separately (see README step 4).

begin;

create table if not exists public.engaged_visitor_alert_queue (
  session_id         text primary key,
  trigger_event_id   text,
  trigger_event_name text not null,
  trigger_metadata   jsonb,
  visitor_id         text,
  is_new_visitor     boolean,
  is_internal        boolean not null default false,
  path               text,
  publication_title  text,
  device_type        text,
  city               text,
  region             text,
  country            text,
  occurred_at        timestamptz,
  created_at         timestamptz not null default now()
);

alter table public.engaged_visitor_alert_queue add column if not exists trigger_metadata jsonb;

alter table public.engaged_visitor_alert_queue enable row level security;
-- No policies: only the trigger (security definer) and service role touch it.
revoke all on public.engaged_visitor_alert_queue from anon, authenticated;

create or replace function public.queue_engaged_visitor_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is null
     or btrim(new.session_id) = ''
     or (new.event_name = 'publication_click' and
         coalesce(btrim(new.metadata->>'action'), '') <> 'open_pdf')
     or coalesce(new.is_internal, false)
     or new.event_name not in (
       'publication_click','filter_change','download',
       'share_click','signup','chooser_select','recommendation_click',
       'my_table_add','my_table_open','my_table_remove')
     -- Independently detectable Lovable preview/editor/test provenance only.
     -- Deliberately NO city / region / ASN / IP-range rules.
     or coalesce(new.referrer_host, '') ~* '(^|\.)(lovable\.app|lovable\.dev|lovableproject\.com)$'
     or coalesce(new.user_agent, '') ~* 'lovable'
     or lower(coalesce(new.utm_source, '')) = 'lovable'
  then
    return new;
  end if;

  -- Candidate only: the Edge Function must reload canonical session evidence
  -- and run the shared human-session classifier before sending any notification.
  insert into public.engaged_visitor_alert_queue (
    session_id, trigger_event_id, trigger_event_name, trigger_metadata, visitor_id, is_new_visitor,
    is_internal, path, publication_title, device_type, city, region, country, occurred_at)
  values (
    new.session_id, new.event_id, new.event_name, new.metadata, new.visitor_id, new.is_new_visitor,
    false, new.path, new.publication_title, new.device_type, new.city, new.region,
    new.country, new.occurred_at)
  on conflict (session_id) do nothing;   -- at most one alert per session, race-safe

  return new;
exception when others then
  -- Never block analytics ingest because of alerting.
  return new;
end;
$$;

revoke all on function public.queue_engaged_visitor_alert() from public, anon, authenticated;

drop trigger if exists trg_queue_engaged_visitor_alert on public.analytics_events;
create trigger trg_queue_engaged_visitor_alert
  after insert on public.analytics_events
  for each row execute function public.queue_engaged_visitor_alert();

commit;
