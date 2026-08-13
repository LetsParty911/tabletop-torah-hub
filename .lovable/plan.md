# Faster downloads + real button feedback

## What I measured

Timing the live download link from the server (fast network, no phone):

- Click URL `/view/<id>/download` responds in **0.5–1.0s** — every time, not just the first. The in-memory signed-URL cache barely helps because each request can land on a different worker instance.
- The browser is then redirected to the storage host and pulls the PDF: **another ~0.9s** for a 600KB file (new host, new TLS handshake, no CDN caching).
- Total ≈1.5s on a datacenter connection. On mobile that easily becomes the 5–8s you feel.

So the delay is real: two round trips to two different hosts, and the file is never cached at the edge.

## Fix

### 1. Serve the PDF from our own domain, cached at the edge
Change `/view/<id>/download` from "look up row → mint signed URL → 302 to storage" into a route that streams the PDF back directly with:
- `Content-Disposition: attachment; filename="TorahForTheTable.com_Parshas-X_Publication.pdf"` (same filenames as today)
- `Cache-Control: public, max-age=31536000, immutable` so Cloudflare caches the file at the edge

Result: one request instead of two, same origin (no extra DNS/TLS), and after the first download anywhere in a region the file is served from the CDN — effectively instant.

Because the URL is derived from the row id, published/unpublished is still checked on the origin request; edge-cached responses stay valid because a replaced file gets a new storage path.

### 2. Warm the link before the click
On the card, preconnect to the storage host and prefetch the download route on hover/touch-start, so the origin lookup is already done by the time the finger lifts.

### 3. Real "pressed" feedback (no artificial delay)
The button is a plain link, so nothing visibly changes on tap. Add:
- an immediate `active:` pressed style (scale + darker background) that fires on touch-down
- a brief "Starting download…" label with a small spinner that appears on click and clears on its own after ~1.2s, or as soon as the page regains focus

This is feedback only — it never delays or gates the actual download.

## Technical notes

- `src/routes/view.$id.download.tsx`: replace the 302-to-signed-URL with a streamed `Response` from Supabase storage `download()`, keeping the `X-Robots-Tag: noindex` header and the 404 for unpublished rows; add long-lived `Cache-Control` plus `ETag`.
- `src/components/DownloadToPrintButton.tsx`: add pressed/active styling and the short transient state; keep the existing anchor + `download` attribute and the `sendBeacon` analytics call untouched.
- `src/routes/index.tsx` / archive / view cards: no API changes, just the hover-prefetch hook on the button.
