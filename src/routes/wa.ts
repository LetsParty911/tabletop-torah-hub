import { createFileRoute } from "@tanstack/react-router";
import { whatsappGroupRedirectResponse } from "@/lib/whatsapp-group-clicks.server";

/** Preserve the existing /wa redirect while auditing requests separately. */
export const Route = createFileRoute("/wa")({
  server: {
    handlers: {
      GET: async ({ request }) => whatsappGroupRedirectResponse(request, "wa"),
    },
  },
});
