-- Thursday Progress Meter: manual weekly-upload progress indicator.
-- Reuses the existing public.settings singleton row (id = 1), which
-- already has public-read / admin-write RLS policies in place.

alter table public.settings
  add column if not exists progress_fill_step int not null default 25
    constraint settings_progress_fill_step_check
    check (progress_fill_step in (25, 50, 75, 95, 100)),
  add column if not exists progress_eta timestamptz;
