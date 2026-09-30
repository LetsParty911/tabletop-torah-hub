CREATE TABLE IF NOT EXISTS public.geo_block_cache (
  ip_address text PRIMARY KEY,
  country text,
  region text,
  city text,
  postal_code text,
  provider text,
  lookup_ok boolean NOT NULL DEFAULT false,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.geo_block_cache TO service_role;
ALTER TABLE public.geo_block_cache ENABLE ROW LEVEL SECURITY;