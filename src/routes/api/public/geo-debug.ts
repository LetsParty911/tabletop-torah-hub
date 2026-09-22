import { createFileRoute } from "@tanstack/react-router";

// TEMPORARY diagnostic. Returns only the NAMES of request headers and the
// KEYS of any Cloudflare request context — never any values, so no IP or
// location data is exposed to the browser. Remove once geo capture is fixed.

export const Route = createFileRoute("/api/public/geo-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const headerNames = [...request.headers.keys()].sort();

        const anyReq = request as unknown as {
          cf?: unknown;
          runtime?: { name?: string; cloudflare?: { env?: unknown; context?: unknown } };
          _request?: { cf?: unknown };
        };

        const keysOf = (v: unknown) =>
          v && typeof v === "object" ? Object.keys(v as Record<string, unknown>).sort() : null;

        return Response.json({
          headerNames,
          runtimeName: anyReq.runtime?.name ?? null,
          hasRuntimeCloudflare: Boolean(anyReq.runtime?.cloudflare),
          cfKeys: keysOf(anyReq.cf),
          innerCfKeys: keysOf(anyReq._request?.cf),
        });
      },
    },
  },
});
