-- Already applied to external Supabase project (2026-11-17), retained for source control.
-- Distinct from the intentionally disabled Parsha in Song feature.
CREATE TABLE IF NOT EXISTS public.parsha_audio_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parsha_key text NOT NULL CHECK (parsha_key ~ '^[a-z]{2,60}$'),
  jewish_year integer NOT NULL CHECK (jewish_year BETWEEN 5000 AND 7000),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  description text,
  audio_path text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parsha_audio_books_unique_week UNIQUE (parsha_key, jewish_year),
  CONSTRAINT parsha_audio_books_published_has_audio CHECK (NOT published OR audio_path IS NOT NULL)
);
ALTER TABLE public.parsha_audio_books ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parsha_audio_books FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.parsha_audio_book_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book_id uuid NOT NULL REFERENCES public.parsha_audio_books(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('play', 'download')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.parsha_audio_book_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parsha_audio_book_events FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS parsha_audio_book_events_book_type_idx ON public.parsha_audio_book_events(book_id,event_type);

CREATE OR REPLACE VIEW public.parsha_audio_book_counts WITH (security_invoker = true) AS
SELECT book_id,
 count(*) FILTER (WHERE event_type = 'play')::bigint AS plays,
 count(*) FILTER (WHERE event_type = 'download')::bigint AS downloads
FROM public.parsha_audio_book_events GROUP BY book_id;
REVOKE ALL ON public.parsha_audio_book_counts FROM anon, authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('parsha-audio-books','parsha-audio-books',false,20971520,ARRAY['audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
