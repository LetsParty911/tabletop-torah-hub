import { createFileRoute } from "@tanstack/react-router";

/**
 * /k — short link for the OurKehilla Parshas Chayei Sarah email announcement.
 *
 * Redirect before rendering so the canonical homepage receives the tagged
 * landing URL and can attribute the visit in first-party analytics.
 * Keep this campaign distinct from the existing /r OurKehilla poster link.
 */
export const Route = createFileRoute("/k")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location:
              "https://torahforthetable.com/?utm_source=ourkehilla&utm_medium=email&utm_campaign=chayei_sarah_5787&utm_content=announcement",
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
