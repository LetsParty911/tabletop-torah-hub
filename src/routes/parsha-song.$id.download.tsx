import { createFileRoute } from "@tanstack/react-router";

// Paused: old download URLs must not serve audio or redirect to stored assets.
export const Route = createFileRoute("/parsha-song/$id/download")({
  server: {
    handlers: {
      GET: async () => new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
      }),
    },
  },
});
