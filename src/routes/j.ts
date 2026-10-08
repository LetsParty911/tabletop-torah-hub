import { createFileRoute } from "@tanstack/react-router";
import { J_REDIRECT_TARGET } from "@/lib/j-redirect";

/**
 * /j — branded one-letter short link (workplace poster).
 *
 * Answers with a server-side 302 (temporary) redirect before any rendering,
 * so no page_view/session is created for /j itself and the homepage load
 * carries the UTM parameters for first-party analytics and GA4.
 *
 * Not a page route, so it never appears in the sitemap.
 */
export const Route = createFileRoute("/j")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: J_REDIRECT_TARGET,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
