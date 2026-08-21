ALTER TABLE public.download_attribution ADD COLUMN IF NOT EXISTS session_id text;
CREATE INDEX IF NOT EXISTS download_attribution_session_id_idx ON public.download_attribution (session_id);