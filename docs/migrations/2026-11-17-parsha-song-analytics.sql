-- Per-song first-party listening/download analytics for Torah For The Table.
-- Records only the song ID, event type and server timestamp. No IP/user IDs.
-- Deploy with Supabase apply_migration on external project torah-by-the-table.
create table if not exists public.parsha_song_events (
  event_id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.parsha_songs(id) on delete cascade,
  event_kind text not null check (event_kind in ('play', 'download')),
  recorded_at timestamptz not null default now()
);

create index if not exists parsha_song_events_song_kind_date
  on public.parsha_song_events (song_id, event_kind, recorded_at desc);

alter table public.parsha_song_events enable row level security;
revoke all on table public.parsha_song_events from public, anon, authenticated;
grant select, insert on table public.parsha_song_events to service_role;

-- The admin dashboard reads this view through a server-only service-role
-- client after checking the owner's admin token. Ordinary users have no access.
create or replace view public.parsha_song_event_totals
  with (security_invoker = true) as
select
  song_id,
  count(*) filter (where event_kind = 'play')::bigint as plays_total,
  count(*) filter (where event_kind = 'download')::bigint as downloads_total,
  count(*) filter (where event_kind = 'play'
    and recorded_at >= now() - interval '7 days')::bigint as plays_7d,
  count(*) filter (where event_kind = 'download'
    and recorded_at >= now() - interval '7 days')::bigint as downloads_7d
from public.parsha_song_events
group by song_id;

revoke all on table public.parsha_song_event_totals from public, anon, authenticated;
grant select on table public.parsha_song_event_totals to service_role;
