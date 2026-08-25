# Faster downloads — what's left worth doing

## What I just measured (live, torahforthetable.com)

| File | Size | First hit (total) | Repeat hit (total) |
|---|---|---|---|
| Smallest | 33 KB | 0.82s | 0.48s |
| Mid | 582 KB | 0.86s | — |
| Mid | 866 KB | 0.77s | — |
| Large | 2.38 MB | 0.98s | 0.57s |
| Largest | 4.07 MB | 1.50s | 0.26s |

Two things stand out:

1. Even a 33 KB file takes 0.48–0.82s. That means the time is almost entirely fixed overhead (worker start + row lookup + storage read), not transfer. Transfer is genuinely fast — a 4 MB file came back in 0.26s warm.
2. Some files are very heavy (4.07 MB, 2.38 MB). Those are the only ones where size itself costs a reader real seconds on cellular.

Everything already in place stays: streamed delivery, edge cache with a week-long `s-maxage`, purge-and-warm on publish/replace, idle prewarming of visible cards, and image compression on new uploads.

## Scope of this plan

Two changes, both aimed at the two findings above.

### 1. Backfill compression on pre-existing PDFs

Compression only runs at upload time, so every file uploaded before 2026-08-24 is still at its original weight — that's where the 4 MB and 2.4 MB files come from. Add an admin action that re-runs the existing image-compression pipeline over already-stored files, without you re-uploading anything.

- A "Re-compress" button per row in the admin PDF list, plus a "Re-compress all" bulk action with the same progress UI the publish flow uses.
- Runs the same pipeline new uploads use, so the same safety rules apply (skips CMYK, skips vector-only, skips anything it can't shrink).
- Only writes the new file back if it is actually smaller; otherwise the original is left untouched and the row is reported as "already optimal".
- After a successful rewrite, purge and re-warm the edge cache for that file so readers immediately get the smaller version.
- Shows before/after size per file so you can see what it bought.

Expected: the heaviest files drop substantially; text/vector-only ones won't move, and that's the correct outcome.

### 2. Cut the fixed per-download overhead

The 33 KB file proves ~0.5s is spent before any bytes move. Two low-risk trims:

- Warm the row cache and the edge cache for the current week's files on a schedule, not only at publish time, so a file never goes cold between publish and Shabbos.
- Skip the database round trip on the download path when the edge cache already holds the response, and shorten the storage handshake by requesting the object directly rather than re-resolving it.

Expected: cold first hit drops from ~0.8–1.5s toward ~0.3–0.5s. Warm hits are already near the floor.

## What I am deliberately not proposing

- No change to cache lifetimes, the download route's contract, filenames, or the download button's behavior.
- No re-encoding that could visibly degrade print quality — compression stays conservative and reversible by re-uploading the original.

## Technical notes

- New server function `adminRecompressPdf(id)` in `src/integrations/supabase/api.functions.ts`: downloads the stored object via `getSupabaseAdmin()`, runs `optimizePdfImages` from `src/lib/pdf-image-optimize.server.ts`, uploads back to the same `file_path` only when smaller, then `purgePdfEdgeCache` + `warmPdfEdgeCache`. Returns `{ before, after, skipped, reason }`.
- Admin UI in `src/components/admin/PdfListSection.tsx` (per-row) and a bulk runner reusing `src/components/admin/PublishProgress.tsx`.
- Scheduled warming via a `/api/public/warm-current-week` route guarded by a shared secret, called on a schedule; it iterates the current parsha's published ids and fires `warmPdfEdgeCache`.
- `src/routes/view.$id.download.tsx`: move the edge-cache `match` ahead of any Supabase client construction and keep the existing `rowCache` as the second tier.
