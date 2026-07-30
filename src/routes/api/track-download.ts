import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/track-download")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
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

          const body = (await request.json().catch(() => ({}))) as {
            publication_id?: string;
            publication_title?: string;
          };


          const cf = (request as unknown as { cf?: Record<string, unknown> }).cf ?? {};
          const city = (cf.city as string | undefined) ?? null;
          const region = (cf.region as string | undefined) ?? null;
          const country = (cf.country as string | undefined) ?? null;
          const timezone = (cf.timezone as string | undefined) ?? null;

          const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
          const supabase = getSupabaseAdmin();

          await supabase.from("download_events").insert({
            publication_id: body.publication_id ?? null,
            publication_title: body.publication_title ?? null,
            city,
            region,
            country,
            timezone,
          });

          return new Response(null, { status: 204 });
        } catch (err) {
          console.error("[track-download] insert failed", err);
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
