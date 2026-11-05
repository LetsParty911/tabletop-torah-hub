# November 5 UX correction — preview only

## Delivered
- Hero Browse All uses the actual 22-item collection, clears restrictive choices and reveals the complete list; post-commit scrolling/focus requires no timers or polling. Existing originals and previews remain visible.
- Homepage collection anchor is present in starter, complete-list, fallback and empty states. Hidden Gems and PDF detail return links lead to choices; same-hash This Week requests work without rewriting browser history.
- Mobile menu includes all ten requested destinations, retains search, closes on navigation/Escape and returns focus on Escape.
- Visible length ranges are Under 5, 5–19, 20+; archive `length=long` retains >=5 semantics. Unspecified audience remains unspecified.
- Public root provides skip link and one main; existing inner main containers were neutralized, with admin and maintenance layout behavior preserved. Search has a 2px ring; consent checkbox is 24px and consent copy larger.
- Small first-page images preserve aspect ratio. Future upload/replacement derives <=160×210 WebP from the original rendered PNG, using the existing authorized thumbnail upload. Failed small images retry originals. Small uploads use zero freshness to avoid stale replacement artwork; cleanup failure is surfaced.
- Hidden Gems remains after weekly PDF choices. Original grids use three desktop columns. Brief Insights PDF control is explicitly named. Earlier originals have a meaningful heading.
- PDF detail description uses its actual parsha and stored Jewish year, preserving existing titles/canonical/OG/JSON-LD.

## Verification
- UX/original editions/Hidden Gems/sharing/upload tests: **48 passed**.
- Signup/countdown/homepage tests: **37 passed**.
- Weekly release/override tests: **33 passed**.
- Latest automatic build log: **build OK, 2026-11-05 21:04:05 UTC**. No manual build was run; standalone typecheck was not run.
- Real preview browser checks at 1280px and 390px: Browse All, archive/article/PDF return links, browser back, anchor focus, mobile menu/Escape, medium archive link; one main, no horizontal overflow or page errors.
- Existing storage images eventually loaded their original thumbnails after absent-derivative fallback. Two bundled permanent-cover copies were inspected. Mi Ka'amcha copy is 5,570 bytes versus 21,511-byte original; Wellsprings source was already only 1,907 bytes, so its WebP does not improve transfer.

## Limitations / incomplete item
- **Existing uploaded-thumbnail derivative backfill is not complete.** No storage writes, record changes or schema changes were made. Missing derivatives still request originals, so the reported six-image ~1.4MB transfer reduction is **not claimed**. A safe authorized backfill is needed for immediate savings across existing thumbnails; future upload code alone does not complete this.
- A real upload/replacement was not submitted, avoiding production PDF/storage changes. Its derivative path is code-verified, not authenticated end-to-end upload-verified.
- No publication, DNS, maintenance, security-policy, analytics-ingestion, consent semantics, short-link or PDF route changes were made.

## Files changed
- Navigation/home: `src/routes/index.tsx`, `src/routes/__root.tsx`, `src/lib/weekly-navigation.ts`.
- Filters: `src/lib/length-filter.ts`, `src/routes/archive.tsx`, `src/integrations/supabase/archive-all.functions.ts`, `src/components/ReadingCollectionView.tsx`.
- Thumbnails: `src/lib/thumbnail-preview.ts`, `src/components/SmallPdfImage.tsx`, `src/components/PdfCoverThumbnail.tsx`, `src/lib/pdf-thumb.ts`, `src/integrations/supabase/api.functions.ts`, `src/routes/admin.tsx`, two `public/publication-covers/*-small.webp` files.
- Journey/landmarks/polish: `src/routes/hidden-gems.tsx`, `src/routes/hidden-gems_.$slug.tsx`, `src/routes/view.$id.tsx`, `src/routes/publications.tsx`, `src/routes/publication.$slug.tsx`, `src/routes/parsha.$slug.tsx`, `src/routes/divrei-torah-parsha.tsx`, `src/routes/originals.tsx`, `src/routes/brief-insights.tsx`, `src/components/DownloadToPrintButton.tsx`, `src/components/WeeklyEmailSignup.tsx`, `src/styles.css`, `src/lib/view-description.ts`.
- Tests: `src/lib/length-filter.test.ts`, `src/lib/weekly-navigation.test.ts`, `src/lib/view-description.test.ts`, `src/components/SmallPdfImage.test.tsx`, `src/tests/homepage.smoke.test.tsx`, `vitest.ux.config.ts`.
- Documentation: `AGENTS.md`, `roadmap.md`, this report. Standing constraints were saved to project memory.