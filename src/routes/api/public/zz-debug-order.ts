import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

export const Route = createFileRoute("/api/public/zz-debug-order")({
  server: {
    handlers: {
      GET: async () => {
        const admin = getSupabaseAdmin();
        const cs = await admin
          .from("checklist_sources")
          .select("title, sort_order, active")
          .order("sort_order", { ascending: true });
        const pubs = await admin
          .from("publications")
          .select("name, sort_order, active")
          .order("sort_order", { ascending: true });
        return new Response(
          JSON.stringify({ cs: cs.data ?? cs.error, pubs: pubs.data ?? pubs.error }, null, 2),
          { headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
