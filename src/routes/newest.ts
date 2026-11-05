import { createFileRoute } from "@tanstack/react-router";
import { whatsappGroupRedirectResponse } from "@/lib/whatsapp-group-clicks.server";

/** Public-friendly alias for the wam WhatsApp group. Shares existing tracking. */
export const Route = createFileRoute("/newest")({
  server: {
    handlers: {
      GET: async ({ request }) => whatsappGroupRedirectResponse(request, "wam"),
    },
  },
});
