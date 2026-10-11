import { waitUntil } from "@vercel/functions";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

const SAFE = /^[a-zA-Z0-9_-]{6,80}$/;
const UUID = /^[a-z0-9-]{36}$/i;

/**
 * Diagnostic only: verifies that the application issued a valid redirect or
 * returned a status error. NEVER proves the CDN delivered bytes or PDF was read.
 * Correlation parameters are accepted only when visitor ID matches the
 * first-party server-observed cookie; forged/incomplete tokens are discarded.
 * Failure of this reporter must never delay an actual PDF response.
 */
export function recordPdfRouteOutcome(request: Request, publicationId: string, status: 302 | 404 | 500): void {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("a") ?? "";
    const sid = url.searchParams.get("s") ?? "";
    const vid = url.searchParams.get("v") ?? "";
    if (!UUID.test(action) || !SAFE.test(sid) || !SAFE.test(vid)) return;
    const cookie = request.headers.get("cookie") ?? "";
    const visitorCookie = cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith("tftt_vid="))?.slice(9);
    if (!visitorCookie || decodeURIComponent(visitorCookie) !== vid) return;
    waitUntil((async () => {
      try {
        const { isAutomatedAgent } = await import("@/lib/request-telemetry.server");
        if (isAutomatedAgent(request.headers.get("user-agent") ?? "")) return;
        const { isInternalRequest } = await import("@/lib/internal-marker.server");
        const internal = await isInternalRequest(request);
        const admin = getSupabaseAdmin();
        const { error } = await admin.from("analytics_events").upsert({
          event_id: "pdf-outcome-" + action,
          event_name: "pdf_route_result",
          occurred_at: new Date().toISOString(),
          visitor_id: vid,
          session_id: sid,
          is_new_visitor: false,
          is_internal: internal,
          path: "/view/" + publicationId + "/pdf",
          publication_id: publicationId,
          metadata: { action_id: action, http_status: status, outcome: status === 302 ? "redirect_issued" : "route_failed" },
        }, { onConflict: "event_id", ignoreDuplicates: true });
        if (error) console.error("[pdf-route-diagnostics] write error", error.message);
      } catch (e) { console.error("[pdf-route-diagnostics] ignored", e); }
    })());
  } catch { /* never interfere with file delivery */ }
}
