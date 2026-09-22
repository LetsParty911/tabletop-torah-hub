import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminAccessToken } from "@/lib/admin-auth.server";
import {
  clearInternalCookieHeader,
  isInternalRequest,
  setInternalCookieHeader,
} from "@/lib/internal-marker.server";

// Admin-only control for the internal/test device marker.
//
// GET  -> { internal: boolean }   (state of the calling browser)
// POST -> { accessToken, action: "mark" | "unmark" }
//
// Only a verified admin can set the cookie, and the cookie is HttpOnly and
// signed server-side, so a public visitor cannot mark their own traffic.

function isSecure(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export const Route = createFileRoute("/api/internal-device")({
  server: {
    handlers: {
      GET: async ({ request }) => json({ internal: await isInternalRequest(request) }),

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const accessToken = typeof body["accessToken"] === "string" ? body["accessToken"] : "";
        const action = body["action"] === "unmark" ? "unmark" : "mark";

        try {
          await verifyAdminAccessToken(accessToken);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Not authenticated";
          return json({ error: message }, { status: message === "Forbidden" ? 403 : 401 });
        }

        const secure = isSecure(request);
        const cookie =
          action === "mark"
            ? await setInternalCookieHeader(secure)
            : clearInternalCookieHeader(secure);

        return json(
          { internal: action === "mark" },
          { headers: { "Set-Cookie": cookie } },
        );
      },
    },
  },
});
