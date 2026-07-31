import { createFileRoute } from "@tanstack/react-router";

const DISALLOW = `Disallow: /admin
Disallow: /admin/
Disallow: /unsubscribe
Disallow: /unsubscribe/
Disallow: /view/*/download
Disallow: /view/*/pdf
Disallow: /api/`;

const AGENTS = [
  "Googlebot",
  "Googlebot-Image",
  "Google-Extended",
  "Bingbot",
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Applebot",
  "Applebot-Extended",
  "CCBot",
];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const blocks = [
          ...AGENTS.map((a) => `User-agent: ${a}\nAllow: /\n${DISALLOW}`),
          `User-agent: *\nAllow: /\n${DISALLOW}`,
        ];

        const body = `${blocks.join("\n\n")}

Sitemap: https://torahforthetable.com/sitemap.xml
`;

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
