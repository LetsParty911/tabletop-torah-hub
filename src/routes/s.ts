import { createFileRoute } from "@tanstack/react-router";
import { S_REDIRECT_TARGET } from "@/lib/s-redirect";

/**
 * /s — branded one-letter short link (shul poster).
 *
 * Answers with a server-side 302 (temporary) redirect before any rendering,
 * so no page_view/session is created for /s itself and the homepage load
 * carries the UTM parameters for first-party analytics and GA4.
 *
 * Not a page route, so it never appears in the sitemap.
 */
export const Route = createFileRoute("/s")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: S_REDIRECT_TARGET,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
