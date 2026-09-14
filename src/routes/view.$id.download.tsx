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

// The PDFs bucket is public. Let Supabase's Storage CDN deliver the bytes
// directly instead of proxying every PDF through the app Worker. The app route
// still validates that the publication is published and preserves the friendly
// download filename, but it no longer sits in the file-transfer data path.
function publicDownloadUrl(admin: any, path: string, filename: string): string {
  const { data } = admin.storage.from("pdfs").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Unable to build public PDF URL");

  const url = new URL(data.publicUrl);
  // Supabase Storage supports ?download=<filename> on public object URLs.
  url.searchParams.set("download", filename);
  return url.toString();
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

          return new Response(null, {
            status: 302,
            headers: {
              ...NOINDEX,
              Location: publicDownloadUrl(admin, entry.path, entry.filename),
              // Do not cache the redirect itself. Supabase can cache the actual
              // public object, while publication/path changes take effect here.
              "Cache-Control": "no-store",
              "Timing-Allow-Origin": "*",
            },
          });
        } catch (err) {
          console.error("[view/download] failed", err);
          return new Response("Download failed", { status: 500, headers: NOINDEX });
        }
      },
    },
  },
});
