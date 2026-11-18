-- Pushover audiobook engagement alerts.
-- External media project only. Keeps existing playback/download tracking unchanged.
-- The webhook authenticates with a token held in Supabase Vault, never in
-- source control, a plain-text Postgres trigger definition, or client code.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'parsha_audio_book_push_hook') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'parsha_audio_book_push_hook',
      'HMAC-strength opaque token for server-only audiobook push webhooks'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.parsha_audio_book_push_delivery (
  event_id bigint PRIMARY KEY REFERENCES public.parsha_audio_book_events(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_code text
);
ALTER TABLE public.parsha_audio_book_push_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parsha_audio_book_push_delivery FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parsha_audio_book_push_delivery TO service_role;

CREATE OR REPLACE FUNCTION public.verify_parsha_audio_book_push_hook(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
 SELECT length(p_token) = 64
   AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'parsha_audio_book_push_hook' AND decrypted_secret = p_token
   );
$$;
REVOKE ALL ON FUNCTION public.verify_parsha_audio_book_push_hook(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_parsha_audio_book_push_hook(text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_parsha_audio_book_push(p_event_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE claimed boolean := false;
BEGIN
  INSERT INTO public.parsha_audio_book_push_delivery(event_id)
  SELECT p_event_id
  WHERE EXISTS (
    SELECT 1 FROM public.parsha_audio_book_events
    WHERE id = p_event_id AND event_type IN ('play', 'download')
  )
  ON CONFLICT (event_id) DO UPDATE
    SET status='sending', attempts=public.parsha_audio_book_push_delivery.attempts+1,
        claimed_at=now(), completed_at=NULL, error_code=NULL
    WHERE public.parsha_audio_book_push_delivery.status='failed'
       OR (public.parsha_audio_book_push_delivery.status='sending'
           AND public.parsha_audio_book_push_delivery.claimed_at < now()-interval '10 minutes')
  RETURNING true INTO claimed;
  RETURN COALESCE(claimed,false);
END $$;
REVOKE ALL ON FUNCTION public.claim_parsha_audio_book_push(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_parsha_audio_book_push(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_parsha_audio_book_push(
  p_event_id bigint, p_status text, p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_status NOT IN ('sent','failed') THEN
    RAISE EXCEPTION 'invalid delivery status';
  END IF;
  UPDATE public.parsha_audio_book_push_delivery
  SET status=p_status,
      completed_at=now(),
      error_code=left(p_error,100)
  WHERE event_id=p_event_id AND status='sending';
END $$;
REVOKE ALL ON FUNCTION public.finish_parsha_audio_book_push(bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_parsha_audio_book_push(bigint,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_parsha_audio_book_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE hook_secret text;
BEGIN
  SELECT decrypted_secret INTO hook_secret
  FROM vault.decrypted_secrets
  WHERE name='parsha_audio_book_push_hook'
  LIMIT 1;
  IF hook_secret IS NULL THEN
    RAISE WARNING '[audiobook-push] missing webhook token';
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := 'https://kwdeyzumetmjcvtbqnzl.supabase.co/functions/v1/parsha-audio-book-push',
    body := pg_catalog.jsonb_build_object('event_id', NEW.id),
    headers := pg_catalog.jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tftt-audio-hook', hook_secret
    ),
    timeout_milliseconds := 10000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[audiobook-push] webhook enqueue failed: %', SQLSTATE;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_parsha_audio_book_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS parsha_audio_book_push_after_insert ON public.parsha_audio_book_events;
CREATE TRIGGER parsha_audio_book_push_after_insert
AFTER INSERT ON public.parsha_audio_book_events
FOR EACH ROW EXECUTE FUNCTION public.enqueue_parsha_audio_book_push();

COMMIT;