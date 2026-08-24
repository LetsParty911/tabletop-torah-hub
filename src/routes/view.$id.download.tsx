import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { buildDownloadFilename } from "@/lib/download-filename";

// Per-worker-instance in-memory cache of the row lookup (path + filename).
// Warm instances skip the DB round trip entirely.
type CacheEntry = { path: string; filename: string; expiresAt: number };
const ROW_CACHE_TTL_MS = 10 * 60 * 1000;
const rowCache = new Map<string, CacheEntry>();

// File-delivery endpoint must never be indexed.
const NOINDEX = { "X-Robots-Tag": "noindex" } as const;

// Cacheable at the CDN for a full week - purge-on-replace/unpublish (see
// pdf-edge-cache.ts) already invalidates immediately on any real change, so
// there's no reason to let a file go cold mid-week on its own. `immutable`
// is still avoided since a replaced file reuses the same URL.
const CACHE_CONTROL =
  "public, max-age=300, s-maxage=604800, stale-while-revalidate=604800";

function quoteFilename(name: string): string {
  return `attachment; filename="${name.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export const Route = createFileRoute("/view/$id/download")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400, headers: NOINDEX });
        }

        // Cloudflare's per-zone edge cache. Cache-Control headers alone don't
        // get a Worker's dynamic responses cached at the edge - only an
        // explicit caches.default check/put does. Undefined outside the
        // Cloudflare runtime (e.g. local dev). Wrapped in try/catch so any
        // Cache API failure just skips caching instead of breaking the
        // download.
        const edgeCache = (globalThis as any).caches?.default;
        if (edgeCache) {
          try {
            const hit = await edgeCache.match(request);
            if (hit) return hit;
          } catch (cacheErr) {
            console.error("[view/download] edge cache match failed", cacheErr);
          }
        }

        try {
          const admin = getSupabaseAdmin();
          const now = Date.now();

          let entry = rowCache.get(id);
          if (!entry || entry.expiresAt <= now) {
            const { data: row, error } = await admin
              .from("pdfs")
              .select("title, file_path, published, parsha_key, publication")
              .eq("id", id)
              .maybeSingle();
            if (error || !row || !row.published || !row.file_path) {
              return new Response("Not found", { status: 404, headers: NOINDEX });
            }
            entry = {
              path: row.file_path as string,
              filename: buildDownloadFilename(
                row.parsha_key,
                row.publication || row.title,
              ),
              expiresAt: now + ROW_CACHE_TTL_MS,
            };
            rowCache.set(id, entry);
          }

          // Stream straight from storage through our own origin so the CDN can
          // cache the file (one request instead of two hosts). Using
          // .asStream() (instead of the default .download(), which fully
          // buffers the file into memory as a Blob before returning) lets
          // bytes start reaching the browser as soon as storage starts
          // sending them, rather than waiting for the whole file to land on
          // the Worker first.
          const { data: stream, error: dErr } = await admin.storage
            .from("pdfs")
            .download(entry.path)
            .asStream();
          if (dErr || !stream) {
            rowCache.delete(id);
            // Last-resort fallback: hand the reader a short-lived signed URL
            // straight from storage so a proxy hiccup never blocks a download.
            const { data: signed } = await admin.storage
              .from("pdfs")
              .createSignedUrl(entry.path, 300, {
                download: entry.filename,
              });
            if (signed?.signedUrl) {
              return new Response(null, {
                status: 302,
                headers: { ...NOINDEX, Location: signed.signedUrl },
              });
            }
            return new Response("Download failed", {
              status: 502,
              headers: NOINDEX,
            });
          }


          const headers = new Headers(NOINDEX);
          headers.set("Content-Type", "application/pdf");
          headers.set("Content-Disposition", quoteFilename(entry.filename));
          headers.set("Cache-Control", CACHE_CONTROL);
          headers.set("Timing-Allow-Origin", "*");
          const response = new Response(stream, { status: 200, headers });

          if (edgeCache) {
            try {
              // .clone() tees the stream so caching never delays or consumes
              // the copy the reader is actually downloading. waitUntil lets
              // the cache write finish after the response has already gone
              // out, so it never adds latency to this download.
              const toCache = response.clone();
              const waitUntil = (request as any).waitUntil;
              const putPromise = Promise.resolve(edgeCache.put(request, toCache)).catch(
                (e: unknown) => console.error("[view/download] edge cache put failed", e),
              );
              if (waitUntil) waitUntil(putPromise);
            } catch (cacheErr) {
              console.error("[view/download] edge cache put failed", cacheErr);
            }
          }

          return response;
        } catch (err) {
          console.error("[view/download] failed", err);
          return new Response("Download failed", { status: 500, headers: NOINDEX });
        }
      },
    },
  },
});
