import { createFileRoute } from "@tanstack/react-router";
import { WA_REDIRECT_TARGET } from "@/lib/wa-redirect";

/**
 * /wa — branded WhatsApp short link.
 *
 * Answers with a server-side 302 (temporary) redirect before any rendering,
 * so no page_view/session is created for /wa itself and the homepage load
 * carries the UTM parameters for first-party analytics and GA4.
 * Not a page route, so it never appears in the sitemap.
 */
export const Route = createFileRoute("/wa")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: WA_REDIRECT_TARGET,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
