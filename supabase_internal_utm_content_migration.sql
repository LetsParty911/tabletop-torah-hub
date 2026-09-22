-- Canonical analytics: internal/test marker + utm_content
--
-- STATUS: already applied in the external "torah-by-the-table" analytics
-- project. This file exists so the repository documents the live schema and so
-- the change can be replayed idempotently on any other environment.
--
-- Nothing here is destructive: no table, column, index or row is dropped.
-- Legacy analytics tables (page_views, search_events, download_events) are
-- intentionally left untouched and remain historical/audit sources.
--
-- The canonical `download_served` event needs NO schema change: it is an
-- ordinary row in analytics_events with event_name = 'download_served' and a
-- metadata.action_id that correlates it with the user-initiated `download`
-- event. `download_served` means the application validated the publication and
-- issued the redirect to the file. It is NOT proof that the file finished
-- transferring.

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.analytics_events.is_internal IS
  'True only when the request carried a server-verified internal/test device cookie issued to a signed-in admin. Never settable from the client payload. Internal rows are kept for diagnostics and excluded from headline audience metrics.';

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS utm_content text;

COMMENT ON COLUMN public.analytics_events.utm_content IS
  'First-touch utm_content, used to distinguish creative/message variants inside one source/medium/campaign.';

-- Public (non-internal) time-range scans are the hot path for every report.
CREATE INDEX IF NOT EXISTS analytics_events_public_occurred_at_idx
  ON public.analytics_events (occurred_at)
  WHERE is_internal = false;

CREATE INDEX IF NOT EXISTS analytics_events_utm_content_idx
  ON public.analytics_events (utm_content)
  WHERE utm_content IS NOT NULL;
