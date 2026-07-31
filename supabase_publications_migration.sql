-- =====================================================================
-- Migration: canonical `publications` table + pdfs.publication_id
-- Run this in the "torah-by-the-table" Supabase SQL editor.
--
-- Safe to re-run (idempotent). Does NOT drop pdfs.title,
-- pdfs.publication, or pdfs.primary_category.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- 1. Canonical publications ----------
create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  publisher text,
  default_audience text,
  default_format_type text,
  sort_order integer not null default 999,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.publications to anon, authenticated;
grant all on public.publications to service_role;

alter table public.publications enable row level security;

drop policy if exists "publications_public_read" on public.publications;
create policy "publications_public_read" on public.publications
  for select to anon, authenticated using (true);

drop policy if exists "publications_admin_write" on public.publications;
create policy "publications_admin_write" on public.publications
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------- 2. Seed from checklist_sources (the 18 correct names + order) ----------
insert into public.publications (name, sort_order, active)
select cs.title, cs.sort_order, cs.active
from public.checklist_sources cs
on conflict (name) do update
  set sort_order = excluded.sort_order,
      active     = excluded.active,
      updated_at = now();

-- Discontinued publication that still has an archived PDF.
insert into public.publications (name, sort_order, active)
values ('Kids Corner', 999, false)
on conflict (name) do update set active = false, updated_at = now();

-- ---------- 3. pdfs.publication_id ----------
alter table public.pdfs
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

create index if not exists pdfs_publication_id_idx on public.pdfs (publication_id);

-- ---------- 4. Backfill: exact (case-insensitive) name match ----------
update public.pdfs p
set publication_id = pub.id
from public.publications pub
where p.publication_id is null
  and lower(btrim(p.title)) = lower(pub.name);

-- ---------- 5. Backfill: explicit variant mappings ----------
with variants(src_title, dest_name) as (
  values
    ('Toras Avigdor for Kids',                                              'Toras Avigdor Junior'),
    ('Kids Corner Parsha Questions',                                        'Parsha Questions & Answers'),
    ('Peninei Mechkerei Eretz — Harav Hagaon Rachamim Moshe Shayo, Shlita', 'Peninei Mechkerei Eretz'),
    ('Artscroll By the Shabbos Table',                                      'Artscroll by the Shabbos Table'),
    ('Artscroll Torah Tidbits',                                             'The Sorts of Tidbits'),
    ('Kids Corner',                                                         'Kids Corner')
)
update public.pdfs p
set publication_id = pub.id
from variants v
join public.publications pub on lower(pub.name) = lower(v.dest_name)
where p.publication_id is null
  and lower(btrim(p.title)) = lower(v.src_title);

-- "Torah for the Table Original" is intentionally NOT a publication: left null.

-- ---------- 6. Defaults = most common value per publication ----------
with counts as (
  select publication_id, audience as v, count(*) as c
  from public.pdfs
  where publication_id is not null and audience is not null
  group by 1, 2
), ranked as (
  select *, row_number() over (partition by publication_id order by c desc, v asc) as rn
  from counts
)
update public.publications pub
set default_audience = r.v, updated_at = now()
from ranked r
where r.publication_id = pub.id and r.rn = 1;

with counts as (
  select publication_id, format_type as v, count(*) as c
  from public.pdfs
  where publication_id is not null and format_type is not null
  group by 1, 2
), ranked as (
  select *, row_number() over (partition by publication_id order by c desc, v asc) as rn
  from counts
)
update public.publications pub
set default_format_type = r.v, updated_at = now()
from ranked r
where r.publication_id = pub.id and r.rn = 1;

-- ---------- 7. Normalize pdfs to their publication's defaults ----------
-- Report of rows that WILL change (run before the update if you want a preview):
--   select p.id, p.title, p.parsha_key, p.audience, pub.default_audience,
--          p.format_type, pub.default_format_type
--   from public.pdfs p join public.publications pub on pub.id = p.publication_id
--   where p.audience is distinct from coalesce(pub.default_audience, p.audience)
--      or p.format_type is distinct from coalesce(pub.default_format_type, p.format_type);

update public.pdfs p
set audience    = coalesce(pub.default_audience, p.audience),
    format_type = coalesce(pub.default_format_type, p.format_type)
from public.publications pub
where pub.id = p.publication_id
  and (p.audience is distinct from coalesce(pub.default_audience, p.audience)
    or p.format_type is distinct from coalesce(pub.default_format_type, p.format_type));

-- ---------- 8. Reports ----------
-- Unmatched pdfs rows (expected: only "Torah for the Table Original"):
select id, title, parsha_key, jewish_year
from public.pdfs
where publication_id is null
order by title;

-- Canonical publications with their computed defaults:
select name, publisher, default_audience, default_format_type, sort_order, active
from public.publications
order by sort_order, name;
