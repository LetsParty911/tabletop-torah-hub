# Measured current-week thumbnail optimization

## Read-only baseline and scope
- Fresh live homepage: 22 distinct current Chayei Sarah PDF IDs. No total is hardcoded in runtime selection.
- 20 uploaded PNG covers: 6,987,884 bytes total. Both permanent covers left unchanged.
- No legacy `.small.webp` objects existed for those 20 IDs; baseline visitor rendering requested none.
- Initial 1280×1800 browser load requested five uploaded covers: 1,426,418 body bytes. Expanded collection: 6,987,884 bytes.
- Browser: 5 server-function calls, 25 storage-resource requests (duplicates/revalidation included). Internal database query count cannot be inferred from browser requests; thumbnail selection adds no database queries, only one paginated Storage inventory per collection read (currently one page).
- Recursive authorized Storage inventory: 869 files, 538,555,929 bytes across three buckets; 26 list calls for the one-time full usage audit. Projected addition 173,140 bytes, below conservative 900 MB safety cutoff. Other projects' organization-wide usage is not visible here; no plan changes.

## Non-destructive writes
- `tools/backfill-weekly-thumbnails.py` defaults to dry-run, accepts freshly measured live IDs, caps at 22, reads originals, rechecks ETag, checks storage headroom and writes only absent immutable objects with `x-upsert:false`.
- Applied exactly 20 new `<id>.<original-etag>.small.webp` objects, total 173,140 bytes. No PNG, PDF, database record or existing derivative was overwritten/deleted.
- Every new public URL returned 200 with exact expected bytes. Rerun: zero new objects/bytes. Candidates preserve aspect ratio, use Lanczos/quality-86 WebP, max 160×210, max 24 KiB; largest 13,892 bytes. Visual contact-sheet and desktop/mobile checks preserve artwork/headings; tiny body text is naturally not readable at cover size. Larger reader previews remain original.
- Failed/unsupported/oversize WebP generation retains existing PNG fallback; no JPEG conversion needed for these measured candidates.

## Safe activation and replacement
- `verified-thumbnails.ts` maps only real objects with matching CURRENT original ETag, MIME and size budget.
- `verified-thumbnails.server.ts` reads a paginated inventory once per collection call, fails original-only, no HEAD probes, no cross-request availability caching.
- Homepage resource DTO adds `small_thumb_url`; only compact image components consume it. Original `thumb_url` and PDF URLs/IDs stay unchanged. Other archives/detail surfaces retain existing behavior.
- Future successful admin thumbnail uploads write immutable derivative paths with long cache TTL and no overwrite. If derivative generation/upload fails, the current original no longer matches the prior derivative, so selection falls back immediately. Old derivatives remain non-destructively stored.
- Preview: five initial uploaded covers deliver 41,602 bytes instead of 1,426,418 (97.08% reduction); all 20 deliver 173,140 instead of 6,987,884 (97.52%). These are cover body-byte comparisons, not total website transfer or a claimed PageSpeed score.

## Verification
- 90 UX/thumbnail/PDF regressions + 37 signup + 33 weekly = 160 passing tests.
- `bunx --package @typescript/native-preview tsgo --noEmit`: exit 0.
- Automatic build log: build OK after edits.
- Desktop/mobile preview: 22 choices, decoded covers, no thumbnail 404, no original PNG requests, no runtime errors, This Week anchor focused.
- Genuine thumbnail click preserves action/session/visitor correlation; analytics and its PDF request blocked during browser testing, so no fabricated reader events. Mocked regression confirms exactly one `open_pdf` thumbnail action and original PDF ID. No real upload/replacement performed because that would change a PDF or original artwork; pure tests cover replacement invalidation and fallback.
- Basic security scan found no issues but does not include deep code analysis; publish tool warned some other scan results remain stale. No security findings bypassed.
- Production publishing requested for https://torahforthetable.com. One fresh post-request browser check at approximately 21:40 UTC returned HTTP 200 but still the previous deployment `3e97eb71-0f6d-4fda-b287-1677dcfc47e4`: 20 PNGs / 6,987,884 bytes, zero versioned WebPs. Therefore production savings are NOT yet verified; hosting release completion is the remaining blocker. No repeated publish or DNS changes.
- Exact added file paths and byte counts are preserved in `thumbnail-backfill-2026-11-05.json`. Original checksums/sizes rechecked unchanged after writes; final idempotent dry-run reports zero new objects and bytes.