CREATE TABLE public.maintenance_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  path text NOT NULL,
  country text,
  region text,
  city text,
  device text NOT NULL DEFAULT 'unknown',
  referrer_domain text,
  classification text NOT NULL DEFAULT 'unknown' CHECK (classification IN ('likely_human','automation','unknown')),
  visitor_key text,
  visitor_key_source text
);
COMMENT ON TABLE public.maintenance_visits IS 'Server-side log of public page requests served the Closed for Maintenance view. No raw IPs, UAs or query strings. Separate from canonical analytics. Server (service role) only.';
CREATE INDEX maintenance_visits_created_at_idx ON public.maintenance_visits (created_at DESC);
GRANT ALL ON public.maintenance_visits TO service_role;
REVOKE ALL ON public.maintenance_visits FROM anon, authenticated;
ALTER TABLE public.maintenance_visits ENABLE ROW LEVEL SECURITY;