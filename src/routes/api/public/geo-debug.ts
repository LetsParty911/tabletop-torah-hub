import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

// TEMPORARY diagnostic. Returns only type/shape information — never any
// header values, IPs or location data. Remove once geo capture is settled.

function describe(v: unknown) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v !== "object") return typeof v;
  return `object:${Object.keys(v as Record<string, unknown>).sort().join(",")}`;
}

export const Route = createFileRoute("/api/public/geo-debug")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const a = request as unknown as Record<string, unknown>;
        let outer: Record<string, unknown> = {};
        try {
          const r = getRequest() as unknown as Record<string, unknown>;
          outer = {
            outerCf: describe(r?.["cf"]),
            outerHeaderNames: r?.["headers"]
              ? [...(r["headers"] as Headers).keys()].sort()
              : null,
          };
        } catch (e) {
          outer = { outerError: String(e).slice(0, 200) };
        }

        return Response.json({
          handlerCf: describe(a["cf"]),
          hasCfProp: "cf" in request,
          ownProps: Object.getOwnPropertyNames(request).sort(),
          protoProps: Object.getOwnPropertyNames(Object.getPrototypeOf(request)).sort(),
          ...outer,
        });
      },
    },
  },
});
