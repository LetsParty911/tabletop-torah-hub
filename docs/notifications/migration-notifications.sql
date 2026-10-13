-- GENERIC OWNER NOTIFICATIONS — Phase A foundation. STAGED; apply to the EXTERNAL analytics project.
-- That project serves BOTH preview and production, but this file is purely ADDITIVE:
--   * creates 5 new private tables + 3 functions, no triggers, no webhooks;
--   * does not touch analytics_events, visitor_alert_queue, engaged_visitor_alert_queue,
--     vpn_connection_checks or vpn_security_notifications;
--   * cannot send anything by itself (sending only happens from the app's dispatcher,
--     which defaults to master OFF + dry-run ON + every category OFF).
-- Rollback: docs/notifications/rollback-notifications.sql

begin;
set local lock_timeout = '3s';

create table if not exists public.notification_settings (
  id          integer primary key default 1 check (id = 1),
  settings    jsonb not null default '{}'::jsonb,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.notification_rules (
  category    text primary key,
  enabled     boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id               uuid primary key default gen_random_uuid(),
  event_key        text not null unique,
  category         text not null,
  title            text not null,
  message          text not null,
  status           text not null default 'pending'
                   check (status in ('pending','sending','sent','failed','dry_run','skipped','dead')),
  attempts         integer not null default 0,
  lease_until      timestamptz,
  next_attempt_at  timestamptz not null default now(),
  last_error       text,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  updated_at       timestamptz not null default now()
);
create index if not exists notification_outbox_due_idx on public.notification_outbox (status, next_attempt_at);
create index if not exists notification_outbox_created_idx on public.notification_outbox (created_at desc);

create table if not exists public.notification_delivery_log (
  id          bigserial primary key,
  outbox_id   uuid references public.notification_outbox(id) on delete cascade,
  event_key   text not null,
  category    text not null,
  outcome     text not null,  -- sent = Pushover ACCEPTED (not proof the phone displayed it)
  detail      text,
  created_at  timestamptz not null default now()
);
create index if not exists notification_delivery_log_created_idx on public.notification_delivery_log (created_at desc);

create table if not exists public.notification_schedule_state (
  key          text primary key,   -- e.g. 'engaged_ingest_cursor'
  value        text,
  updated_at   timestamptz not null default now()
);

-- Private: service role only. No anon/authenticated policies → RLS denies all.
do $$ declare t text; begin
  foreach t in array array['notification_settings','notification_rules','notification_outbox',
                           'notification_delivery_log','notification_schedule_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant usage, select on sequence public.notification_delivery_log_id_seq to service_role;

-- Atomic lease claim. SKIP LOCKED => concurrent dispatchers never get the same row.
create or replace function public.claim_notifications(p_limit integer, p_lease_seconds integer)
returns setof public.notification_outbox language sql security definer set search_path = '' as $$
  update public.notification_outbox o
     set status = 'sending', attempts = o.attempts + 1,
         lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   where o.id in (
     select id from public.notification_outbox
      where (status in ('pending','failed') and next_attempt_at <= now() and attempts < 5)
         or (status = 'sending' and lease_until < now() and attempts < 5)
      order by created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked)
  returning o.*;
$$;

-- Finish only if still leased (a late, crashed worker can't overwrite a newer outcome).
create or replace function public.finish_notification(p_id uuid, p_status text, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.notification_outbox;
begin
  select * into r from public.notification_outbox where id = p_id and status = 'sending' for update;
  if not found then return; end if;
  if p_status = 'failed' then
    update public.notification_outbox set
      status = case when r.attempts >= 5 then 'dead' else 'failed' end,
      next_attempt_at = now() + make_interval(secs => least(3600, 60 * power(2, greatest(0, r.attempts - 1))::int)),
      lease_until = null, last_error = left(p_error, 200), updated_at = now()
    where id = p_id;
  elsif p_status = 'pending' then  -- quiet hours: hold without burning an attempt
    update public.notification_outbox set status = 'pending', attempts = greatest(0, r.attempts - 1),
      next_attempt_at = now() + interval '15 minutes', lease_until = null, updated_at = now() where id = p_id;
  else
    update public.notification_outbox set status = p_status, lease_until = null, last_error = left(p_error, 200),
      sent_at = case when p_status = 'sent' then now() else sent_at end, updated_at = now() where id = p_id;
  end if;
  insert into public.notification_delivery_log (outbox_id, event_key, category, outcome, detail)
  values (p_id, r.event_key, r.category, p_status, left(p_error, 200));
end $$;

create or replace function public.retry_failed_notifications()
returns integer language sql security definer set search_path = '' as $$
  with u as (update public.notification_outbox set status = 'pending', attempts = 0, next_attempt_at = now(),
               updated_at = now() where status in ('failed','dead') returning 1)
  select count(*)::int from u;
$$;

revoke all on function public.claim_notifications(integer, integer) from public, anon, authenticated;
revoke all on function public.finish_notification(uuid, text, text) from public, anon, authenticated;
revoke all on function public.retry_failed_notifications() from public, anon, authenticated;
grant execute on function public.claim_notifications(integer, integer) to service_role;
grant execute on function public.finish_notification(uuid, text, text) to service_role;
grant execute on function public.retry_failed_notifications() to service_role;

insert into public.notification_settings (id, settings) values (1, '{}'::jsonb) on conflict (id) do nothing;

commit;
