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

// Cacheable, but revalidated with the ETag so a replaced file is picked up
// quickly. `immutable` is deliberately avoided: admins do replace files.
const CACHE_CONTROL = "public, max-age=600, s-maxage=86400, stale-while-revalidate=86400";

function quoteFilename(name: string): string {
  return `attachment; filename="${name.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export const Route = createFileRoute("/view/$id/download")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400, headers: NOINDEX });
        }

        const t0 = Date.now();
        const now = t0;
        let cacheHit = true;
        let entry = rowCache.get(id);
        if (!entry || entry.expiresAt <= now) {
          cacheHit = false;
          const admin = getSupabaseAdmin();
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

        const etag = `"${id}-${entry.path.length}-${entry.filename.length}"`;
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, {
            status: 304,
            headers: {
              ETag: etag,
              "Cache-Control": CACHE_CONTROL,
              ...NOINDEX,
            },
          });
        }

        // Stream straight from storage through our own origin so Cloudflare
        // can cache the file at the edge (one request instead of two hosts).
        const base = (process.env.EXT_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
        const key =
          process.env.EXT_SUPABASE_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          "";
        const objectUrl = `${base}/storage/v1/object/pdfs/${entry.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;

        const tDb = Date.now();
        const upstream = await fetch(objectUrl, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (!upstream.ok || !upstream.body) {
          return new Response("Download failed", { status: 502, headers: NOINDEX });
        }

        const tUp = Date.now();
        const headers = new Headers(NOINDEX);
        headers.set(
          "Server-Timing",
          `row;desc="${cacheHit ? "cache" : "db"}";dur=${tDb - t0}, storage;dur=${tUp - tDb}, worker;dur=${tUp - t0}`,
        );
        headers.set("Content-Type", "application/pdf");
        headers.set("Content-Disposition", quoteFilename(entry.filename));
        headers.set("Cache-Control", CACHE_CONTROL);
        headers.set("ETag", etag);
        const len = upstream.headers.get("content-length");
        if (len) headers.set("Content-Length", len);

        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
