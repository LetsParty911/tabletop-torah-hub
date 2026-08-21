CREATE TABLE public.download_attribution (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  publication_id TEXT,
  publication_title TEXT,
  referrer_host TEXT,
  referrer_url TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_path TEXT,
  source_path TEXT,
  country TEXT
);

GRANT ALL ON public.download_attribution TO service_role;

ALTER TABLE public.download_attribution ENABLE ROW LEVEL SECURITY;

CREATE INDEX download_attribution_created_at_idx ON public.download_attribution (created_at DESC);