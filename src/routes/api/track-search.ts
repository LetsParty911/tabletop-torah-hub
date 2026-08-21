import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/track-search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await checkRateLimit(request, "track-search", "TRACKING_RATE_LIMITER"))) {
            return new Response(null, { status: 204 });
          }

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

          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const query =
            typeof body["query"] === "string" ? (body["query"] as string).trim().slice(0, 200) : "";
          const sessionId =
            typeof body["session_id"] === "string"
              ? (body["session_id"] as string).slice(0, 80)
              : "";
          if (!query || !sessionId) return new Response(null, { status: 204 });

          const rc = Number(body["result_count"]);
          const resultCount = Number.isFinite(rc) ? Math.max(0, Math.trunc(rc)) : 0;

          const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
          const supabase = getSupabaseAdmin();

          await supabase.from("search_events").insert({
            query,
            result_count: resultCount,
            session_id: sessionId,
          });

          return new Response(null, { status: 204 });
        } catch (err) {
          console.error("[track-search] insert failed", err);
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
