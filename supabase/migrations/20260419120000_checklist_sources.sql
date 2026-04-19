-- Checklist sources: admin-managed list of expected weekly newsletter PDFs.
create table if not exists public.checklist_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists checklist_sources_active_order_idx
  on public.checklist_sources (active, sort_order);

alter table public.checklist_sources enable row level security;

drop policy if exists "checklist_sources_public_read" on public.checklist_sources;
create policy "checklist_sources_public_read" on public.checklist_sources
  for select to anon, authenticated using (true);

drop policy if exists "checklist_sources_admin_write" on public.checklist_sources;
create policy "checklist_sources_admin_write" on public.checklist_sources
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Seed existing hardcoded titles so day-one behavior is preserved.
insert into public.checklist_sources (title, active, sort_order) values
  ('Torah Wellsprings', true, 10),
  ('Torah Sweets',      true, 20),
  ('Aderaba',           true, 30),
  ('Toras Avigdor',     true, 40)
on conflict (title) do nothing;
