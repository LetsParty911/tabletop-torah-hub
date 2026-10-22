import { createFileRoute } from "@tanstack/react-router";
import { ST_REDIRECT_TARGET } from "@/lib/st-redirect";

/**
 * /st — short link for a WhatsApp promotion.
 *
 * Server-side temporary redirect: the homepage, not /st, creates the
 * analytics session. Keep the same no-cache and noindex behavior as /wa.
 * Do not change existing /wa, /s, /r, or site-access controls.
 */
export const Route = createFileRoute("/st")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: ST_REDIRECT_TARGET,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
