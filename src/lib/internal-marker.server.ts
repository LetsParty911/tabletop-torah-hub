// Server-verified "this device is mine" marker for analytics.
//
// The marker is an HttpOnly, first-party cookie whose value is an HMAC that
// only the server can produce. A visitor cannot mark their own traffic as
// internal by editing localStorage or the JSON payload: /api/events ignores any
// client-supplied internal flag and only trusts this cookie's signature.
//
// The signing key is derived from an existing server-only secret (the analytics
// service-role key), so no new environment variable has to be configured. The
// key itself is never sent to the browser — only the derived HMAC is.

export const INTERNAL_COOKIE = "tftt_internal";

const MARKER_PAYLOAD = "internal-device-v1";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function signingSecret(): string {
  const secret =
    process.env["EXT_SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    "";
  if (!secret) throw new Error("Internal marker unavailable: no server key configured");
  // Namespace the derived key so it can never collide with any other use.
  return `tftt-internal-marker::${secret}`;
}

async function hmacHex(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value a marked device should carry. */
export async function internalMarkerValue(): Promise<string> {
  return `v1.${await hmacHex(MARKER_PAYLOAD)}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True only when the request carries a cookie this server signed.
 * Any failure (missing key, malformed cookie) is treated as "not internal".
 */
export async function isInternalRequest(request: Request): Promise<boolean> {
  try {
    const value = readCookie(request, INTERNAL_COOKIE);
    if (!value) return false;
    return timingSafeEqual(value, await internalMarkerValue());
  } catch {
    return false;
  }
}

function cookieAttributes(secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export async function setInternalCookieHeader(secure: boolean): Promise<string> {
  const value = await internalMarkerValue();
  return `${INTERNAL_COOKIE}=${value}; Max-Age=${COOKIE_MAX_AGE}; ${cookieAttributes(secure)}`;
}

export function clearInternalCookieHeader(secure: boolean): string {
  return `${INTERNAL_COOKIE}=; Max-Age=0; ${cookieAttributes(secure)}`;
}
