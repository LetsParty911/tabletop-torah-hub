import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

export const Route = createFileRoute("/view/$id/download")({
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
        const { data: blob, error: dErr } = await admin.storage
          .from("pdfs")
          .download(row.file_path);
        if (dErr || !blob) {
          return new Response("Download failed", { status: 500 });
        }
        const safeName =
          (row.title || "document").replace(/[^a-zA-Z0-9._ -]/g, "_").trim() + ".pdf";
        const buf = await blob.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${safeName}"`,
            "Cache-Control": "private, max-age=0, no-store",
          },
        });
      },
    },
  },
});
