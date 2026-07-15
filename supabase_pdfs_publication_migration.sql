-- =====================================================================
-- Migration: add `publication` column to pdfs (external Supabase project)
-- Run this in the "torah-by-the-table" Supabase SQL editor.
--
-- Notes:
--  * `primary_category` is left untouched. Categories (kids/family/in_depth/
--    reference) and publications (tftt_original/mikaamcha/peninei_mechkerei)
--    are two independent facts per PDF.
--  * The app tolerates the column missing (falls back on insert), so it's
--    safe to deploy the code first and run this migration afterward.
-- =====================================================================

ALTER TABLE public.pdfs
  ADD COLUMN IF NOT EXISTS publication text;

ALTER TABLE public.pdfs
  DROP CONSTRAINT IF EXISTS pdfs_publication_check;

ALTER TABLE public.pdfs
  ADD CONSTRAINT pdfs_publication_check
  CHECK (publication IS NULL OR publication IN (
    'tftt_original',
    'mikaamcha',
    'peninei_mechkerei'
  ));

CREATE INDEX IF NOT EXISTS pdfs_publication_idx ON public.pdfs (publication);
