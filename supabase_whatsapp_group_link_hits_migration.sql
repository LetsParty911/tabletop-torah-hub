-- Group-specific WhatsApp short-link request audit.
-- Apply to the external torah-by-the-table Supabase project before release.
-- Server-side only: public visitors must not insert or select audit data.
CREATE TABLE IF NOT EXISTS public.whatsapp_group_link_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clicked_at timestamptz NOT NULL DEFAULT now(),
  group_code text NOT NULL CHECK (group_code IN ('wap', 'wam', 'waz')),
  is_automated boolean NOT NULL DEFAULT false,
  device_type text NOT NULL DEFAULT 'unknown'
);
CREATE INDEX IF NOT EXISTS whatsapp_group_link_hits_time_group_idx
  ON public.whatsapp_group_link_hits (clicked_at DESC, group_code);
ALTER TABLE public.whatsapp_group_link_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_group_link_hits FROM anon, authenticated;
GRANT SELECT, INSERT ON public.whatsapp_group_link_hits TO service_role;
