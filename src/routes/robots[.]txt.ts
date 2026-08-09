import { createFileRoute } from "@tanstack/react-router";

// Note: /view/*/download is deliberately NOT disallowed. Those URLs are already
// indexed; blocking crawling would hide the X-Robots-Tag: noindex header and
// keep them stuck in the index. They can be blocked once they drop out.
const BODY = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /offline

Sitemap: https://torahforthetable.com/sitemap.xml
`;

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(BODY, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=0, s-maxage=3600",
          },
        }),
    },
  },
});
