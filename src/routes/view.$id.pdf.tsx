import { MAINTENANCE_MODE, maintenanceResponse } from "@/lib/maintenance";
import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

const NOINDEX = { "X-Robots-Tag": "noindex" } as const;

export const Route = createFileRoute("/view/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (MAINTENANCE_MODE) return maintenanceResponse();
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400, headers: NOINDEX });
        }

        try {
          const admin = getSupabaseAdmin();
          const { data: row, error } = await admin
            .from("pdfs")
            .select("file_path, published")
            .eq("id", id)
            .maybeSingle();

          if (error || !row || !row.published || !row.file_path) {
            return new Response("Not found", { status: 404, headers: NOINDEX });
          }

          // The PDFs bucket is public, so let Supabase Storage/CDN deliver the
          // PDF directly instead of proxy-streaming every preview through the
          // app Worker. This route still checks the publication's current
          // published state before revealing the object URL.
          const { data } = admin.storage.from("pdfs").getPublicUrl(row.file_path);
          if (!data?.publicUrl) {
            return new Response("Load failed", { status: 500, headers: NOINDEX });
          }

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
          return new Response("Load failed", { status: 500, headers: NOINDEX });
        }
      },
    },
  },
});
