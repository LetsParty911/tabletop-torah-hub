import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";
import { recordPdfRouteOutcome } from "@/lib/pdf-route-diagnostics.server";

const NOINDEX = { "X-Robots-Tag": "noindex" } as const;

export const Route = createFileRoute("/view/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const requestUrl = new URL(request.url);
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
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400, headers: NOINDEX });
        }

        try {
          // Independent reads can proceed together, but maintenance MUST be
          // checked before any PDF URL is revealed. Read failures still close.
          const maintenancePromise = adminBypass
            ? Promise.resolve(null)
            : import("@/lib/maintenance.server").then(({ maintenanceGate }) =>
                maintenanceGate(requestUrl.pathname),
              );
          const admin = getSupabaseAdmin();
          const publicationPromise = admin
            .from("pdfs")
            .select("file_path, published")
            .eq("id", id)
            .maybeSingle();

          const [closed, { data: row, error }] = await Promise.all([
            maintenancePromise,
            publicationPromise,
          ]);
          if (closed) return closed;

          if (error || !row || !row.published || !row.file_path) {
            await recordPdfRouteOutcome(request, id, 404);
            return new Response("Not found", { status: 404, headers: NOINDEX });
          }

          // The PDFs bucket is public, so let Supabase Storage/CDN deliver the
          // PDF directly instead of proxy-streaming every preview through the
          // app Worker. This route still checks the publication's current
          // published state before revealing the object URL.
          const { data } = admin.storage.from("pdfs").getPublicUrl(row.file_path);
          if (!data?.publicUrl) {
            await recordPdfRouteOutcome(request, id, 500);
            return new Response("Load failed", { status: 500, headers: NOINDEX });
          }

          if (adminBypass && request.headers.get("X-Admin-Link") === "1") {
            return Response.json({ url: data.publicUrl }, { headers: { ...NOINDEX, "Cache-Control": "no-store" } });
          }
          await recordPdfRouteOutcome(request, id, 302);
          return new Response(null, {
            status: 302,
            headers: {
              ...NOINDEX,
              Location: data.publicUrl,
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch (err) {
          console.error("[view/pdf] failed", err);
          await recordPdfRouteOutcome(request, id, 500);
          return new Response("Load failed", { status: 500, headers: NOINDEX });
        }
      },
    },
  },
});
