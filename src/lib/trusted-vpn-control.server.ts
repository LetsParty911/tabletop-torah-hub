import { verifyAdminAccessToken } from "./admin-auth.server";
import { issueTrustedVpnToken, trustedVpnSecret, trustedVpnExpiry, trustedVpnCookieHeader, verifyTrustedVpnToken } from "./trusted-vpn-browser.server";

const json = (body: unknown, status = 200, cookie?: string) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) },
});

export async function trustedVpnControl(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (request.method === "POST" && (request.headers.get("origin") !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site")) return json({ error: "Same-origin request required" }, 403);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
    const text = await request.text();
    if (text.length > 16_384) return json({ error: "Request too large" }, 413);
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Invalid request" }, 400);
      body = parsed as Record<string, unknown>;
    } catch { return json({ error: "Invalid request" }, 400); }
  }
  const token = request.method === "GET" ? (request.headers.get("authorization") ?? "").replace(/^Bearer /, "") : body["accessToken"];
  try { await verifyAdminAccessToken(typeof token === "string" ? token : ""); }
  catch (error) { return json({ error: "Admin authentication required" }, error instanceof Error && error.message === "Forbidden" ? 403 : 401); }
  if (request.method === "GET") {
    const expiresAt = await trustedVpnExpiry(request);
    return json({ trusted: expiresAt !== null, expiresAt, available: Boolean(await trustedVpnSecret(request)) });
  }
  if (body["action"] === "revoke") return json({ trusted: false, expiresAt: null }, 200, trustedVpnCookieHeader(request, null));
  if (body["action"] !== "enable") return json({ error: "Invalid action" }, 400);
  const secret = await trustedVpnSecret(request);
  if (!secret) return json({ error: "Trusted VPN browsing unavailable: signing secret missing" }, 503);
  const value = await issueTrustedVpnToken(secret);
  // Only the expiry is returned, never the capability value in JSON.
  const expiresAt = await verifyTrustedVpnToken(value, secret);
  return json({ trusted: true, expiresAt }, 200, trustedVpnCookieHeader(request, value));
}