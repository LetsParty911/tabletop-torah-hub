-- Run this in the project's SQL editor.
-- Match weekly checklist slots by a stable foreign key instead of free-text titles.
-- Adds publications.id links on both sides and backfills them from normalized titles.

-- Normalized title key: lowercase, letters+digits only
-- ("Tzedek Tzedek - R' Yehuda Zev Klein" === "Tzedek Tzedek - R'Yehuda Zev Klein").
create or replace function public.pub_title_key(t text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g')
$$;

alter table public.pdfs
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

alter table public.checklist_sources
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

create index if not exists pdfs_publication_id_idx on public.pdfs (publication_id);
create index if not exists checklist_sources_publication_id_idx on public.checklist_sources (publication_id);
create index if not exists publications_title_key_idx on public.publications (public.pub_title_key(name));

-- Create canonical publication rows the checklist references but that don't exist yet.
insert into public.publications (name, sort_order, active)
select cs.title, cs.sort_order, true
from public.checklist_sources cs
where not exists (
  select 1 from public.publications p
  where public.pub_title_key(p.name) = public.pub_title_key(cs.title)
);

-- Backfill links.
update public.checklist_sources cs
set publication_id = p.id
from public.publications p
where cs.publication_id is null
  and public.pub_title_key(p.name) = public.pub_title_key(cs.title);

update public.pdfs f
set publication_id = p.id
from public.publications p
where f.publication_id is null
  and public.pub_title_key(p.name) in (
    public.pub_title_key(f.publication),
    public.pub_title_key(f.title)
  );

-- One publication per weekly slot (parsha + jewish year + publication).
create unique index if not exists pdfs_unique_weekly_slot
  on public.pdfs (parsha_key, jewish_year, publication_id)
  where publication_id is not null;
