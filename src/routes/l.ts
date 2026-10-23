import { createFileRoute } from "@tanstack/react-router";
import { L_REDIRECT_TARGET } from "@/lib/l-redirect";

/**
 * /l — short link for last-minute WhatsApp sharing.
 * Redirect on the server before rendering. The homepage, not /l, records
 * the visitor session and PDF activity with first-touch UTM attribution.
 * Existing site access restrictions and other short links remain unchanged.
 */
export const Route = createFileRoute("/l")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: L_REDIRECT_TARGET,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
