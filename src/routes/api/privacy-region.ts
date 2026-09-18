import { createFileRoute } from "@tanstack/react-router";
import { getRequestTelemetry } from "@/lib/request-telemetry.server";
import { isConsentRequiredCountry } from "@/lib/privacy-region";

// Minimal, purpose-limited region check used only to decide whether the
// enhanced-analytics consent prompt must be shown. Returns the coarse country
// code (from trustworthy hosting-edge data only) and nothing else — no
// precise location, no IP, no identifiers.

export const Route = createFileRoute("/api/privacy-region")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { country } = getRequestTelemetry(request);
        const body = JSON.stringify({
          country: country ?? null,
          consentRequiredForEnhancedAnalytics: isConsentRequiredCountry(country),
        });
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            // Varies per visitor location; never cache in a shared cache.
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
