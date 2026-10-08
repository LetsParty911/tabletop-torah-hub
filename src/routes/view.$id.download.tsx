import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "cloudflare:workers";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { buildDownloadFilename } from "@/lib/download-filename";

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

    // Inherit the session's own context (source, campaign, referrer, device,
    // geo) from its earliest recorded event, so this server row never looks
    // like a separate "Direct" / "unknown device" visit.
    const context: Record<string, unknown> = {};
    try {
      const { data: prior } = await admin
        .from("analytics_events")
        .select(
          "landing_path, device_type, source_group, referrer_host, referrer_url, utm_source, utm_medium, utm_campaign, country, region, city",
        )
        .eq("session_id", sessionId)
        .eq("visitor_id", visitorId)
        .neq("event_name", "download_served")
        .order("occurred_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (prior) {
        for (const [k, v] of Object.entries(prior)) if (v != null) context[k] = v;
      }
    } catch {
      /* context is best-effort */
    }
    if (!context["device_type"]) {
      const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
      context["device_type"] = /ipad|tablet|(android(?!.*mobile))/.test(ua)
        ? "tablet"
        : /mobi|iphone|ipod|android/.test(ua)
          ? "mobile"
          : "desktop";
    }

    const row: Record<string, unknown> = {
      ...context,
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

// Cloudflare's waitUntil keeps tracking alive after the redirect without
// making the visitor wait. Never fall back to awaiting analytics here: a slow
// Supabase read/write must not delay or prevent delivery of a valid PDF.
function queueDownloadTracking(request: Request, id: string, filename: string): void {
  try {
    waitUntil(recordDownloadServed(request, id, filename));
  } catch (err) {
    // Tracking is best-effort. Keep the download working if scheduling fails.
    console.error("[view/download] unable to schedule tracking", err);
  }
}

export const Route = createFileRoute("/view/$id/download")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const requestUrl = new URL(request.url);
        const routeTimings: string[] = [];
        let adminBypass = false;
        if (requestUrl.searchParams.get("admin") === "1") {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const authHeader = request.headers.get("authorization");
            const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
            if (token) {
              const { data } = await supabaseAdmin.auth.getUser(token);
              const email = (data.user?.email ?? "").toLowerCase();
              const admins = (process.env["ADMIN_EMAILS"] ?? "")
                .split(",")
                .map((v) => v.trim().toLowerCase())
                .filter(Boolean);
              adminBypass = !!email && admins.includes(email);
            }
          } catch {
            adminBypass = false;
          }
        }
        if (!adminBypass) {
          const { maintenanceGate } = await import("@/lib/maintenance.server");
          const maintenanceStarted = performance.now();
          const closed = await maintenanceGate(requestUrl.pathname);
          routeTimings.push(`maintenance;dur=${(performance.now() - maintenanceStarted).toFixed(1)}`);
          if (closed) return closed;
        }
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400, headers: NOINDEX });
        }

        try {
          const admin = getSupabaseAdmin();
          // Always revalidate publication state and storage path. Admin replacements
          // and unpublishes must take effect on the very next download request.
          const lookupStarted = performance.now();
          const { data: row, error } = await admin
            .from("pdfs")
            .select("title, file_path, published, parsha_key, publication")
            .eq("id", id)
            .maybeSingle();
          routeTimings.push(`pdf_lookup;dur=${(performance.now() - lookupStarted).toFixed(1)}`);

          if (error || !row || !row.published || !row.file_path) {
            return new Response("Not found", { status: 404, headers: { ...NOINDEX, "Server-Timing": routeTimings.join(", ") } });
          }

          const entry = {
            path: row.file_path as string,
            filename: buildDownloadFilename(
              row.parsha_key,
              row.publication || row.title,
            ),
          };

          const deliveryUrl = publicDownloadUrl(admin, entry.path, entry.filename);

          // A validated redirect must never wait for analytics queries or writes.
          // Cloudflare continues this task after the response is returned.
          queueDownloadTracking(request, id, entry.filename);
          if (adminBypass && request.headers.get("X-Admin-Link") === "1") {
            return Response.json({ url: deliveryUrl }, { headers: { ...NOINDEX, "Cache-Control": "no-store", "Server-Timing": routeTimings.join(", ") } });
          }
          return new Response(null, {
            status: 302,
            headers: {
              ...NOINDEX,
              Location: deliveryUrl,
              // Do not cache the redirect itself. Supabase can cache the actual
              // public object, while publication/path changes take effect here.
              "Cache-Control": "no-store",
              "Timing-Allow-Origin": "*",
              "Server-Timing": routeTimings.join(", "),
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
