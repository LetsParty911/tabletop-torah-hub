CREATE TABLE public.site_maintenance (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
GRANT ALL ON public.site_maintenance TO service_role;
ALTER TABLE public.site_maintenance ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.site_maintenance IS 'Single-row canonical maintenance-mode switch. Server-only (service role). Changed only via the admin Maintenance control.';
INSERT INTO public.site_maintenance (id, enabled, updated_by) VALUES (1, true, 'bootstrap') ON CONFLICT (id) DO NOTHING;