-- Parsha in Song: execute against the SAME external Supabase project used by
-- the existing publication PDFs. Do not execute against the Lovable auth project.
-- This file is staged for review; code changes do not apply it.
create table if not exists public.parsha_songs (
  id uuid primary key default gen_random_uuid(),
  parsha_key text not null check (char_length(parsha_key) between 2 and 60),
  jewish_year integer not null check (jewish_year between 5000 and 7000),
  title text not null check (char_length(title) between 1 and 180),
  description text,
  lyrics text,
  audio_path text,
  cover_path text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parsha_key, jewish_year),
  constraint song_publication_complete check
    (not published or (nullif(audio_path, '') is not null and nullif(cover_path, '') is not null))
);

alter table public.parsha_songs enable row level security;
revoke all on public.parsha_songs from anon, authenticated;
grant select on public.parsha_songs to anon, authenticated;

drop policy if exists "read published parsha songs" on public.parsha_songs;
create policy "read published parsha songs" on public.parsha_songs
  for select to anon, authenticated using (published = true);

create or replace function public.touch_parsha_song_timestamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists touch_parsha_songs on public.parsha_songs;
create trigger touch_parsha_songs before update on public.parsha_songs
  for each row execute function public.touch_parsha_song_timestamp();

-- Public read for streamed audio and visible cover; no public upload policies.
-- Only the service-role server handler may issue upload operations.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('parsha-song-media', 'parsha-song-media', true, 20971520,
        array['audio/mpeg','image/jpeg','image/png'])
on conflict (id) do nothing;

-- Prepare metadata without showing a broken public player before assets exist.
insert into public.parsha_songs (parsha_key, jewish_year, title, published)
values ('vayetzei', 5787, 'Wherever You Go', false)
on conflict (parsha_key, jewish_year) do nothing;
