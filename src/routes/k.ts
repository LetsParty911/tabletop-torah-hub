import { createFileRoute, redirect } from "@tanstack/react-router";
import { K_REDIRECT_TARGET } from "@/lib/k-redirect";

/**
 * /k — short link for OurKehilla.
 *
 * Direct visits get a server-side 302 before rendering (also handled in
 * src/start.ts request middleware). In-app navigation to /k leaves the SPA
 * with a full document load to the same tagged homepage URL, so the homepage
 * attributes the visit exactly as a direct visit would.
 * Keep this campaign distinct from the existing /r OurKehilla poster link.
 */
export const Route = createFileRoute("/k")({
  beforeLoad: () => {
    throw redirect({ href: K_REDIRECT_TARGET, reloadDocument: true });
  },
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: K_REDIRECT_TARGET,
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        }),
    },
  },
});
