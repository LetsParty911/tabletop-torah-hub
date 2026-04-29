import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/debug-resend")({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.RESEND_API_KEY;
        if (!key) {
          return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }

        // Fetch domains list using the runtime key
        const res = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const body = await res.text();

        // Also fetch /api-keys (returns the key's own info, scoped to its account)
        const meRes = await fetch("https://api.resend.com/api-keys", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const meBody = await meRes.text();

        return new Response(
          JSON.stringify(
            {
              runtime_key_prefix: key.slice(0, 8) + "..." + key.slice(-4),
              runtime_key_length: key.length,
              domains_status: res.status,
              domains_body: safeParse(body),
              apikeys_status: meRes.status,
              apikeys_body: safeParse(meBody),
            },
            null,
            2
          ),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    },
  },
});

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
