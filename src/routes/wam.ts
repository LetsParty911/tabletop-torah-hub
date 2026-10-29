import { createFileRoute } from "@tanstack/react-router";
import { whatsappGroupRedirectResponse } from "@/lib/whatsapp-group-clicks.server";

/**
 * Per-group WhatsApp short link. Records a best-effort, server-side request
 * before redirecting to the homepage with first-touch UTM attribution.
 */
export const Route = createFileRoute("/wam")({
  server: {
    handlers: {
      GET: async ({ request }) => whatsappGroupRedirectResponse(request, "wam"),
    },
  },
});
