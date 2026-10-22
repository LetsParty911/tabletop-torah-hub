import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/trusted-vpn-browser")({
  server: { handlers: {
    GET: async ({ request }) => (await import("@/lib/trusted-vpn-control.server")).trustedVpnControl(request),
    POST: async ({ request }) => (await import("@/lib/trusted-vpn-control.server")).trustedVpnControl(request),
  } },
});