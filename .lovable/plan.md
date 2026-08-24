# Making downloads faster

## What I measured (live, torahforthetable.com)

Timing the real download links right now:

| Case | Time to first byte | Total |
|---|---|---|
| Cold (first request for that file in a region) | 1.2 – 1.9s | 1.5 – 2.3s |
| Warm (same file requested again in that region) | 0.12s | 0.12s |

File sizes: 33KB up to ~580KB.

So the delivery path is already correct — the edge cache works, and a warm file is effectively instant. The problem is that almost every real reader hits the **cold** path: they are the first person in their city to ask for that file that week, and they pay 1.5–2s while our server looks the row up in the database and pulls the file out of storage.

## Fix: make the click always hit a warm file

### 1. Pre-warm on the page the reader is already looking at

When the homepage (and the archive/view page) renders the week's cards, quietly request each PDF in the background at low priority after the page is interactive. By the time a finger reaches the Download button, the file is sitting in the reader's own regional edge cache, so the click is ~0.1s.

Guards so this never hurts anyone:
- Skip on slow or metered connections and when Save-Data is on.
- Limit to the visible week's cards (cap ~6 files), staggered, lowest priority.
- Desktop and mobile both benefit here; unlike the old hover-prefetch this is a cache warm, not a second copy racing the download.

### 2. Warm the cache the moment something is published

When an admin publishes (or replaces) a PDF, fire a background request to its own download URL so the file is already cached before the first reader arrives, and the existing purge still clears stale bytes.

### 3. Cut the cold-path work itself

For requests that still miss the cache:
- Look up the row and start the storage read without the extra serialization we do today, and keep the response streaming (already in place).
- Extend the shared edge lifetime so a file stays warm for the whole week instead of expiring mid-week, with purge-on-change keeping it correct.

### 4. Shrink the files

The largest publications are ~600KB. Compressing/linearizing PDFs at upload time typically cuts 30–50% off, which shows up directly on phone connections. This is optional and can be a second step if you want to keep the originals byte-for-byte.

## Technical notes

- `src/routes/index.tsx`, `src/routes/archive.tsx`, `src/routes/view.$id.tsx`: add a shared `usePrewarmDownloads(ids)` hook (idle-callback, `connection.saveData`/`effectiveType` guard, `fetch(url, { priority: 'low', mode: 'no-cors' })` capped and staggered).
- `src/components/DownloadToPrintButton.tsx`: unchanged behavior; keep the desktop hover warm, now redundant but harmless.
- `src/integrations/supabase/api.functions.ts` publish/replace paths: call the download URL once after `purgePdfEdgeCache`.
- `src/routes/view.$id.download.tsx`: raise `s-maxage` to a week (purge already handles replacement), keep `stale-while-revalidate`, keep the signed-URL fallback.

## Not doing

- No change to the download filenames, the button UX, or the analytics beacon.
