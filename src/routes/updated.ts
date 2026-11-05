import { createFileRoute } from "@tanstack/react-router";
import { whatsappGroupRedirectResponse } from "@/lib/whatsapp-group-clicks.server";

/** Public-friendly alias for the waz WhatsApp group. Shares existing tracking. */
export const Route = createFileRoute("/updated")({
  server: {
    handlers: {
      GET: async ({ request }) => whatsappGroupRedirectResponse(request, "waz"),
    },
  },
});
