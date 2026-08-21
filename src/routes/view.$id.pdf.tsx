import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

export const Route = createFileRoute("/view/$id/pdf")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!/^[0-9a-f-]{36}$/i.test(id)) {
          return new Response("Bad request", { status: 400 });
        }
        const admin = getSupabaseAdmin();
        const { data: row, error } = await admin
          .from("pdfs")
          .select("title, file_path, published")
          .eq("id", id)
          .maybeSingle();
        if (error || !row || !row.published) {
          return new Response("Not found", { status: 404 });
        }
        const { data: stream, error: dErr } = await admin.storage
          .from("pdfs")
          .download(row.file_path)
          .asStream();
        if (dErr || !stream) {
          return new Response("Load failed", { status: 500 });
        }
        const safeName =
          (row.title || "document").replace(/[^a-zA-Z0-9._ -]/g, "_").trim() + ".pdf";
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${safeName}"`,
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
