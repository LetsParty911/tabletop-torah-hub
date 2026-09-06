-- Admin-controlled visibility for the Thursday upload progress meter.
-- Defaults to visible so existing behavior is preserved after deployment.

alter table public.settings
  add column if not exists progress_visible boolean not null default true;
