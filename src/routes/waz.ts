import { createFileRoute } from "@tanstack/react-router";
import { whatsappGroupRedirectTarget } from "@/lib/whatsapp-group-redirect";

/**
 * Dedicated WhatsApp group short link, with first-touch attribution on
 * the homepage after a 302 redirect. No intermediate page_view is logged.
 */
export const Route = createFileRoute("/waz")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: whatsappGroupRedirectTarget("waz"),
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
