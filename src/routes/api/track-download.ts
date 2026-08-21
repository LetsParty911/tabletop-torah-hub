import { createFileRoute } from "@tanstack/react-router";
import { checkRateLimit } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/track-download")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!(await checkRateLimit(request, "track-download", "TRACKING_RATE_LIMITER"))) {
            return new Response(null, { status: 204 });
          }

          // Never record admin activity.
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
          const str = (k: string, max = 300): string | null => {
            const v = body[k];
            return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
          };
          const publicationId = str("publication_id", 100);
          const publicationTitle = str("publication_title", 300);


          // Cloudflare geo can be on `request.cf` or in the CF-* headers,
          // depending on how the runtime exposes the incoming request.
          const cfObj = (request as unknown as { cf?: Record<string, unknown> }).cf ?? {};
          const city = (cfObj.city as string | undefined) ?? request.headers.get("cf-ipcity") ?? null;
          const region = (cfObj.region as string | undefined) ?? request.headers.get("cf-ipregion") ?? null;
          const country = (cfObj.country as string | undefined) ?? request.headers.get("cf-ipcountry") ?? null;
          const timezone = (cfObj.timezone as string | undefined) ?? request.headers.get("cf-timezone") ?? null;

          const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
          const supabase = getSupabaseAdmin();

          await supabase.from("download_events").insert({
            publication_id: publicationId,
            publication_title: publicationTitle,
            city,
            region,
            country,
            timezone,
          });

          // Traffic-source attribution lives in the Cloud project, since the
          // external download_events table has no referrer columns.
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            await supabaseAdmin.from("download_attribution").insert({
              publication_id: publicationId,
              publication_title: publicationTitle,
              referrer_host: str("referrer_host", 200),
              referrer_url: str("referrer_url", 800),
              utm_source: str("utm_source", 120),
              utm_medium: str("utm_medium", 120),
              utm_campaign: str("utm_campaign", 200),
              landing_path: str("landing_path", 300),
              source_path: str("source_path", 300),
              session_id: str("session_id", 100),
              country,
            } as never);
          } catch (attrErr) {
            console.error("[track-download] attribution insert failed", attrErr);
          }

          return new Response(null, { status: 204 });
        } catch (err) {
          console.error("[track-download] insert failed", err);
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
