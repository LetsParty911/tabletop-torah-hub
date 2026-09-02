-- Allow 0% as a valid Thursday Progress Meter reading.

alter table public.settings
  drop constraint if exists settings_progress_fill_step_check;

alter table public.settings
  add constraint settings_progress_fill_step_check
  check (progress_fill_step in (0, 25, 50, 75, 95, 100));
