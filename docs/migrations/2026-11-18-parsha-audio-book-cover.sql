-- Applied to external Supabase project 2026-11-18.
-- Supports independently uploaded cover artwork on Parsha Audio Book pages.
ALTER TABLE public.parsha_audio_books ADD COLUMN IF NOT EXISTS cover_path text;
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['audio/mpeg','image/jpeg','image/png']::text[]
WHERE id = 'parsha-audio-books';
