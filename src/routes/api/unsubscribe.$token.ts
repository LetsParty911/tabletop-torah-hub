import { createFileRoute } from "@tanstack/react-router";

import { getSupabaseAdmin } from "@/integrations/supabase/ext.server";

export const Route = createFileRoute("/api/unsubscribe/$token")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const token = params.token;

        // RFC 8058 one-click unsubscribe clients POST this exact form value.
        // Return a neutral 204 for malformed/unknown tokens so the endpoint
        // cannot be used to enumerate subscribers.
        if (!/^[0-9a-f-]{8,128}$/i.test(token)) {
          return new Response(null, { status: 204 });
        }

        let body = "";
        try {
          body = await request.text();
        } catch {
          body = "";
        }
        if (body && !body.includes("List-Unsubscribe=One-Click")) {
          return new Response(null, { status: 204 });
        }

        const admin = getSupabaseAdmin();
        const { error } = await admin
          .from("subscribers")
          .update({
            active: false,
            unsubscribed_at: new Date().toISOString(),
          })
          .eq("unsubscribe_token", token)
          .eq("active", true);

        if (error) {
          console.error("one-click unsubscribe error", error);
          return new Response(null, { status: 500 });
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
