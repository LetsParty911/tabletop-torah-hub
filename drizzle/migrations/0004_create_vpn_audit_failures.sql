CREATE TABLE public.vpn_audit_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  error_category text NOT NULL,
  error_message text,
  decision text NOT NULL,
  verdict text,
  detected_by text[] NOT NULL DEFAULT '{}',
  ip_address text,
  country text,
  region text,
  city text,
  request_path text
);
COMMENT ON TABLE public.vpn_audit_failures IS 'Fallback log when the VPN audit write to the analytics database fails. Server (service role) only.';
CREATE INDEX vpn_audit_failures_created_at_idx ON public.vpn_audit_failures (created_at DESC);
GRANT ALL ON public.vpn_audit_failures TO service_role;
ALTER TABLE public.vpn_audit_failures ENABLE ROW LEVEL SECURITY;