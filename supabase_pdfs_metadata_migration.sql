-- =====================================================================
-- Migration: add per-publication metadata columns to pdfs
-- Run this in the "torah-by-the-table" Supabase SQL editor.
--
-- All columns are nullable so existing rows remain valid. The app
-- tolerates the columns being absent (falls back on insert/select) so
-- it's safe to deploy code first and run this migration afterwards.
-- =====================================================================

ALTER TABLE public.pdfs
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS audience    text,
  ADD COLUMN IF NOT EXISTS format_type text,
  ADD COLUMN IF NOT EXISTS page_count  integer,
  ADD COLUMN IF NOT EXISTS badge       text;

-- Value guards (nullable-friendly)
ALTER TABLE public.pdfs
  DROP CONSTRAINT IF EXISTS pdfs_audience_check;
ALTER TABLE public.pdfs
  ADD CONSTRAINT pdfs_audience_check
  CHECK (audience IS NULL OR audience IN ('Adults', 'Families', 'Kids'));

ALTER TABLE public.pdfs
  DROP CONSTRAINT IF EXISTS pdfs_format_type_check;
ALTER TABLE public.pdfs
  ADD CONSTRAINT pdfs_format_type_check
  CHECK (format_type IS NULL OR format_type IN (
    'Short Vorts', 'Stories', 'Halacha', 'Essays'
  ));

ALTER TABLE public.pdfs
  DROP CONSTRAINT IF EXISTS pdfs_badge_check;
ALTER TABLE public.pdfs
  ADD CONSTRAINT pdfs_badge_check
  CHECK (badge IS NULL OR badge IN (
    'Recommended', 'Quick Read', 'Kids'' Pick'
  ));

ALTER TABLE public.pdfs
  DROP CONSTRAINT IF EXISTS pdfs_page_count_check;
ALTER TABLE public.pdfs
  ADD CONSTRAINT pdfs_page_count_check
  CHECK (page_count IS NULL OR page_count >= 0);
