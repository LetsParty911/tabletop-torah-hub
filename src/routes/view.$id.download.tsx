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

// Cacheable at the CDN, but revalidated often enough that a replaced file
// (same storage path) reaches readers quickly. `immutable` is avoided.
const CACHE_CONTROL =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

function quoteFilename(name: string): string {
  return `attachment; filename="${name.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export const Route = createFileRoute("/view/$id/download")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400, headers: NOINDEX });
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
          // cache the file (one request instead of two hosts).
          const { data: blob, error: dErr } = await admin.storage
            .from("pdfs")
            .download(entry.path);
          if (dErr || !blob) {
            rowCache.delete(id);
            return new Response("Download failed", {
              status: 502,
              headers: NOINDEX,
            });
          }

          const buf = await blob.arrayBuffer();
          const headers = new Headers(NOINDEX);
          headers.set("Content-Type", "application/pdf");
          headers.set("Content-Disposition", quoteFilename(entry.filename));
          headers.set("Cache-Control", CACHE_CONTROL);
          headers.set("Content-Length", String(buf.byteLength));
          headers.set("Timing-Allow-Origin", "*");
          return new Response(buf, { status: 200, headers });
        } catch (err) {
          console.error("[view/download] failed", err);
          return new Response("Download failed", { status: 500, headers: NOINDEX });
        }
      },
    },
  },
});
