-- Optional: per-publication default description used to auto-fill the admin
-- upload form. Run in the "torah-by-the-table" SQL editor. The app tolerates
-- this column being absent.
alter table public.publications
  add column if not exists default_description text;
