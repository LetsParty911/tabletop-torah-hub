import { createFileRoute } from "@tanstack/react-router";
import { whatsappGroupRedirectResponse } from "@/lib/whatsapp-group-clicks.server";

/** Preserve the existing /l redirect while auditing requests separately. */
export const Route = createFileRoute("/l")({
  server: {
    handlers: {
      GET: async ({ request }) => whatsappGroupRedirectResponse(request, "l"),
    },
  },
});
