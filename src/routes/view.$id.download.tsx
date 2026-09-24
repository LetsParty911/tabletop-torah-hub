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

// Canonical `download_served` event.
//
// Meaning: the application validated the publication and issued the redirect to
// the real file. It is NOT proof that the file finished transferring — the
// bytes travel from the storage CDN directly to the browser and nothing reports
// completion back to us.
//
// The client passes an action_id (plus its own visitor/session ids) on the
// download link so this row can be correlated with the user-initiated
// `download` event. Every client value is validated and length-capped here.
const SAFE_ID = /^[A-Za-z0-9_-]{6,80}$/;

function safeId(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return SAFE_ID.test(trimmed) ? trimmed : null;
}

async function recordDownloadServed(
  request: Request,
  publicationId: string,
  filename: string,
): Promise<void> {
  try {
    const url = new URL(request.url);
    const actionId = safeId(url.searchParams.get("a"));
    if (!actionId) return; // Only correlate genuine, tagged download actions.

    const sessionId = safeId(url.searchParams.get("s"));
    const visitorId = safeId(url.searchParams.get("v"));
    if (!sessionId || !visitorId) return;

    const { isAutomatedAgent } = await import("@/lib/request-telemetry.server");
    if (isAutomatedAgent(request.headers.get("user-agent") ?? "")) return;

    const { isInternalRequest } = await import("@/lib/internal-marker.server");
    const isInternal = await isInternalRequest(request);

    const admin = getSupabaseAdmin();
    const row: Record<string, unknown> = {
      event_id: `served-${actionId}`,
      event_name: "download_served",
      occurred_at: new Date().toISOString(),
      visitor_id: visitorId,
      session_id: sessionId,
      is_new_visitor: false,
      path: `/view/${publicationId}/download`,
      publication_id: publicationId,
      is_internal: isInternal,
      metadata: { action_id: actionId, filename },
    };

    const { error } = await admin
      .from("analytics_events")
      .upsert([row], { onConflict: "event_id", ignoreDuplicates: true });
    if (error && error.message.includes("is_internal")) {
      const { is_internal: _drop, ...legacy } = row;
      await admin
        .from("analytics_events")
        .upsert([legacy], { onConflict: "event_id", ignoreDuplicates: true });
    }
  } catch (err) {
    console.error("[view/download] download_served failed", err);
  }
}

export const Route = createFileRoute("/view/$id/download")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
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

          // Record download_served in the background: the redirect is issued
          // immediately and the insert finishes after the response is sent.
          // Semantics are unchanged (the server validated and issued the redirect).
          runInBackground(recordDownloadServed(request, id, entry.filename));

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
