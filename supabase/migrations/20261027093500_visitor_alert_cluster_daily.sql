-- Group only the observed Cloudflare/Chrome-119 first-load alert cluster.
-- Raw analytics_events and visitor_alert_queue remain unchanged.
-- The Edge Function checks the complete per-session signature before calling
-- this atomic, service-role-only daily claim.
BEGIN;
CREATE TABLE IF NOT EXISTS public.visitor_alert_cluster_daily (
  cluster_key text NOT NULL,
  day_et date NOT NULL,
  first_session_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_key, day_et)
);
ALTER TABLE public.visitor_alert_cluster_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visitor_alert_cluster_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.visitor_alert_cluster_daily TO service_role;

CREATE OR REPLACE FUNCTION public.claim_visitor_alert_cluster_day(
  p_cluster_key text,
  p_day date,
  p_session_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE claimed boolean;
BEGIN
  IF p_cluster_key <> 'cloudflare-chrome119-10428-direct-v1'
    OR p_day IS NULL
    OR p_session_id IS NULL
    OR length(trim(p_session_id)) = 0
  THEN RETURN false; END IF;
  INSERT INTO public.visitor_alert_cluster_daily (cluster_key, day_et, first_session_id)
  VALUES (p_cluster_key, p_day, p_session_id)
  ON CONFLICT (cluster_key, day_et) DO NOTHING
  RETURNING true INTO claimed;
  RETURN COALESCE(claimed, false);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_visitor_alert_cluster_day(text,date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_visitor_alert_cluster_day(text,date,text) TO service_role;
COMMIT;