CREATE TABLE public.blocked_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  city text,
  region text,
  country text,
  postal_code text,
  geo_source text,
  geo_provider text,
  path text,
  referrer text,
  user_agent text,
  blocked boolean NOT NULL DEFAULT true,
  block_reason text NOT NULL,
  action text NOT NULL
);
GRANT ALL ON public.blocked_visits TO service_role;
ALTER TABLE public.blocked_visits ENABLE ROW LEVEL SECURITY;
CREATE INDEX blocked_visits_created_at_idx ON public.blocked_visits (created_at DESC);
CREATE INDEX blocked_visits_ip_idx ON public.blocked_visits (ip_address);