import { createFileRoute } from "@tanstack/react-router";
import { whatsappGroupRedirectResponse } from "@/lib/whatsapp-group-clicks.server";

/** Preserve the existing /st redirect while auditing requests separately. */
export const Route = createFileRoute("/st")({
  server: {
    handlers: {
      GET: async ({ request }) => whatsappGroupRedirectResponse(request, "st"),
    },
  },
});
