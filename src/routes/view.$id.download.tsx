import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { buildDownloadFilename } from "@/lib/download-filename";

// Per-worker-instance in-memory cache of signed download URLs.
// Workers are stateless across cold starts, but warm instances reuse this
// so repeat clicks skip the DB lookup and signed-URL round trip entirely.
type CacheEntry = { url: string; filename: string; expiresAt: number };
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour signed URL
const CACHE_SAFETY_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const cache = new Map<string, CacheEntry>();

// File-delivery endpoint must never be indexed, redirect or not.
const NOINDEX_HEADERS = { "X-Robots-Tag": "noindex" } as const;

function redirectNoIndex(url: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: url, ...NOINDEX_HEADERS },
  });
}


export const Route = createFileRoute("/view/$id/download")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400 });
        }

        const now = Date.now();
        const cached = cache.get(id);
        if (cached && cached.expiresAt - CACHE_SAFETY_MS > now) {
          return redirectNoIndex(cached.url);
        }


        const admin = getSupabaseAdmin();
        const { data: row, error } = await admin
          .from("pdfs")
          .select("title, file_path, published, parsha_key, publication")
          .eq("id", id)
          .maybeSingle();
        if (error || !row || !row.published) {
          return new Response("Not found", { status: 404 });
        }

        const safeName = buildDownloadFilename(
          row.parsha_key,
          row.publication || row.title,
        );

        const { data: signed, error: sErr } = await admin.storage
          .from("pdfs")
          .createSignedUrl(row.file_path, SIGNED_URL_TTL_SECONDS, {
            download: safeName,
          });

        if (sErr || !signed?.signedUrl) {
          return new Response("Download failed", { status: 500 });
        }

        cache.set(id, {
          url: signed.signedUrl,
          filename: safeName,
          expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000,
        });

        return Response.redirect(signed.signedUrl, 302);
      },
    },
  },
});
