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

// Cacheable, but revalidated often enough that a replaced file (same storage
// path) reaches readers quickly. `immutable` is deliberately avoided.
const CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

/**
 * Worker-level edge cache. The platform CDN in front of us does not retain
 * these responses (every hit reached the origin, costing a DB lookup plus a
 * storage round trip before the first byte). Storing the finished PDF in the
 * Worker's own colo cache turns repeat downloads into a local read.
 */
function edgeCache(): Cache | null {
  try {
    const c = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    return c ?? null;
  } catch {
    return null;
  }
}

function quoteFilename(name: string): string {
  return `attachment; filename="${name.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function serverTiming(dbMs: number, upstreamMs: number, totalMs: number): string {
  return [
    `db;dur=${dbMs};desc="Publication lookup"`,
    `storage;dur=${upstreamMs};desc="Storage response headers"`,
    `app;dur=${totalMs};desc="Application response headers"`,
  ].join(", ");
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

        // Derive the validator from the stored object itself so replacing the
        // file in place (same path) invalidates every cached copy.
        const upstreamTag =
          upstream.headers.get("etag")?.replace(/^W\//, "").replace(/"/g, "") ||
          [
            upstream.headers.get("last-modified"),
            upstream.headers.get("content-length"),
          ]
            .filter(Boolean)
            .join("-") ||
          String(Date.now());
        const etag = `"${id}-${upstreamTag}"`;

        if (request.headers.get("if-none-match") === etag) {
          void upstream.body.cancel();
          const tDone = Date.now();
          return new Response(null, {
            status: 304,
            headers: {
              ETag: etag,
              "Cache-Control": CACHE_CONTROL,
              "Server-Timing": serverTiming(tDb - t0, tUp - tDb, tDone - t0),
              ...NOINDEX,
            },
          });
        }

        const headers = new Headers(NOINDEX);
        headers.set("Content-Type", "application/pdf");
        headers.set("Content-Disposition", quoteFilename(entry.filename));
        headers.set("Cache-Control", CACHE_CONTROL);
        headers.set("ETag", etag);
        headers.set(
          "Server-Timing",
          serverTiming(tDb - t0, tUp - tDb, Date.now() - t0),
        );
        headers.set("Timing-Allow-Origin", "*");
        const len = upstream.headers.get("content-length");
        if (len) headers.set("Content-Length", len);

        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
