import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit } from "@/lib/rate-limit.server";

// Coarse device bucket derived from the user agent. The raw UA string is
// never stored — only "mobile" | "tablet" | "desktop".
function deviceTypeFrom(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(s)) return "mobile";
  return "desktop";
}

export const Route = createFileRoute("/api/track-view")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await checkRateLimit(request, "track-view", "TRACKING_RATE_LIMITER"))) {
            return new Response(null, { status: 204 });
          }

          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

          const rawPath = typeof body["path"] === "string" ? (body["path"] as string) : "";
          // Pathname only — never a query string.
          const path = (rawPath.split("?")[0] ?? "").slice(0, 300) || "/";
          if (path === "/admin" || path.startsWith("/admin/")) {
            return new Response(null, { status: 204 });
          }

          // Never record admin activity, even if the payload lies.
          const referer = request.headers.get("referer") ?? "";
          if (referer) {
            try {
              const p = new URL(referer).pathname;
              if (p === "/admin" || p.startsWith("/admin/")) {
                return new Response(null, { status: 204 });
              }
            } catch {
              /* ignore malformed referer */
            }
          }

          const str = (k: string, max = 300): string | null => {
            const v = body[k];
            return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
          };

          const sessionId = str("session_id", 80);
          const visitorId = str("visitor_id", 80);
          if (!sessionId || !visitorId) return new Response(null, { status: 204 });

          const cf = (request as unknown as { cf?: Record<string, unknown> }).cf ?? {};
          const ua = request.headers.get("user-agent") ?? "";

          const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
          const supabase = getSupabaseAdmin();

          await supabase.from("page_views").insert({
            path,
            referrer: str("referrer", 800),
            referrer_host: str("referrer_host", 200),
            utm_source: str("utm_source", 120),
            utm_medium: str("utm_medium", 120),
            utm_campaign: str("utm_campaign", 200),
            session_id: sessionId,
            visitor_id: visitorId,
            is_new_visitor: body["is_new_visitor"] === true,
            device_type: deviceTypeFrom(ua),
            city: (cf.city as string | undefined) ?? null,
            region: (cf.region as string | undefined) ?? null,
            country: (cf.country as string | undefined) ?? null,
            timezone: (cf.timezone as string | undefined) ?? null,
          });

          return new Response(null, { status: 204 });
        } catch (err) {
          console.error("[track-view] insert failed", err);
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
