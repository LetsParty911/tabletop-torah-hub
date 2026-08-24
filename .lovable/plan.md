# Making downloads faster — page-load prewarming only

## What I measured (live, torahforthetable.com)

| Case | Time to first byte | Total |
|---|---|---|
| Cold (first request for that file in a region) | 1.2 – 1.9s | 1.5 – 2.3s |
| Warm (same file already cached in that region) | 0.12s | 0.12s |

File sizes range from 33KB to ~580KB. Delivery is already correct — a warm file is effectively instant. The problem is that most readers hit the cold path and pay 1.5–2s.

## Scope

Only the page-load prewarming. No changes to publish-time warming, cache lifetimes, the download route, or PDF compression.

## What to build

When the homepage (and archive / view pages) renders publication cards, quietly request each PDF in the background at low priority once the page is interactive. By the time a finger reaches the Download button, the file is in that reader's regional edge cache, so the click is ~0.1s.

Guards so this never hurts anyone:
- Skip when Save-Data is on or the connection reports 2g/slow-2g.
- Cap to the visible week's cards (~6 files), staggered, lowest priority, fired during idle time.
- Run once per file per session; never re-request on re-render.
- Fully fire-and-forget: failures are ignored and nothing blocks rendering or the real download.

## Technical notes

- New `src/hooks/use-prewarm-downloads.ts`: takes a list of publication ids, runs in `requestIdleCallback` (timeout fallback), guards on `navigator.connection.saveData` / `effectiveType`, and issues `fetch('/view/<id>/download', { priority: 'low', mode: 'no-cors', credentials: 'omit' })` staggered ~300ms apart, deduped via a module-level `Set`.
- Wire the hook into `src/routes/index.tsx`, `src/routes/archive.tsx`, and `src/routes/view.$id.tsx` with the ids currently displayed.
- `src/components/DownloadToPrintButton.tsx` and `src/routes/view.$id.download.tsx` stay unchanged.
