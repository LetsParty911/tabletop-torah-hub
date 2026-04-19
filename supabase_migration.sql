-- =====================================================================
-- Torah for the Table — full schema migration
-- Run this in your Supabase SQL editor (https://supabase.com/dashboard → SQL).
-- Safe to re-run; uses IF NOT EXISTS / CREATE OR REPLACE where possible.
-- =====================================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception when duplicate_object then null; end $$;

-- ---------- user_roles (separate table to prevent recursion / privilege escalation) ----------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- Policies on user_roles
drop policy if exists "user_roles_select_own_or_admin" on public.user_roles;
create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------- Auto-grant admin to mekubal@gmail.com on signup ----------
create or replace function public.handle_new_user_admin_seed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email = 'mekubal@gmail.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_admin_seed on auth.users;
create trigger on_auth_user_created_admin_seed
  after insert on auth.users
  for each row execute function public.handle_new_user_admin_seed();

-- Backfill (in case the admin user already exists)
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users where email = 'mekubal@gmail.com'
on conflict (user_id, role) do nothing;

-- ---------- pdfs ----------
create table if not exists public.pdfs (
  id uuid primary key default gen_random_uuid(),
  parsha_key text not null,
  title text not null,
  subtitle text,
  file_path text not null,
  week_of date,
  jewish_year integer,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
-- Add jewish_year column for archival grouping (parsha names repeat each year).
alter table public.pdfs add column if not exists jewish_year integer;
-- Backfill existing rows to current Hebrew year (5786) since the site is brand new.
update public.pdfs set jewish_year = 5786 where jewish_year is null;
create index if not exists pdfs_parsha_published_idx on public.pdfs (parsha_key, published);
create index if not exists pdfs_jewish_year_idx on public.pdfs (jewish_year);

alter table public.pdfs enable row level security;

drop policy if exists "pdfs_public_read_published" on public.pdfs;
create policy "pdfs_public_read_published" on public.pdfs
  for select to anon, authenticated
  using (published = true);

drop policy if exists "pdfs_admin_all" on public.pdfs;
create policy "pdfs_admin_all" on public.pdfs
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------- settings (single-row config: manual parsha override) ----------
create table if not exists public.settings (
  id int primary key default 1,
  parsha_override text,
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;

drop policy if exists "settings_public_read" on public.settings;
create policy "settings_public_read" on public.settings
  for select to anon, authenticated using (true);

drop policy if exists "settings_admin_write" on public.settings;
create policy "settings_admin_write" on public.settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------- subscribers ----------
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.subscribers enable row level security;

drop policy if exists "subscribers_insert_anyone" on public.subscribers;
create policy "subscribers_insert_anyone" on public.subscribers
  for insert to anon, authenticated with check (true);

drop policy if exists "subscribers_admin_select" on public.subscribers;
create policy "subscribers_admin_select" on public.subscribers
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "subscribers_admin_delete" on public.subscribers;
create policy "subscribers_admin_delete" on public.subscribers
  for delete to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---------- Storage bucket: pdfs (private) ----------
insert into storage.buckets (id, name, public)
values ('pdfs', 'pdfs', false)
on conflict (id) do nothing;

-- Storage policies (objects)
drop policy if exists "pdfs_storage_admin_all" on storage.objects;
create policy "pdfs_storage_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'pdfs' and public.has_role(auth.uid(), 'admin'))
  with check (bucket_id = 'pdfs' and public.has_role(auth.uid(), 'admin'));

-- Public/anon reads go through signed URLs generated server-side; no public select policy needed.

-- =====================================================================
-- Done.
-- After running:
--   1. In Authentication → Providers → enable GitHub. Set OAuth credentials.
--   2. Authentication → URL Configuration → add your Lovable preview & published URLs to Redirect URLs.
--   3. Sign in once with mekubal@gmail.com (GitHub primary email) — admin role auto-granted.
-- =====================================================================
