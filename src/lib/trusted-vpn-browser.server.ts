// Independent browser-profile capability: never an analytics/internal marker.
export const TRUSTED_VPN_COOKIE = "tftt_trusted_vpn";
export const TRUSTED_VPN_MAX_AGE = 90 * 24 * 60 * 60;

/** Request-time Worker binding first, then native workerd env, then Node/Vercel. */
export async function trustedVpnSecret(request: Request): Promise<string | null> {
  const runtime = (request as Request & { runtime?: { cloudflare?: { env?: Record<string, unknown> } } }).runtime;
  const bound = runtime?.cloudflare?.env?.["TRUSTED_VPN_BROWSER_SECRET"];
  if (typeof bound === "string" && bound.trim()) return bound;
  try {
    const module = "cloudflare:workers";
    const cf = await import(/* @vite-ignore */ module) as { env?: Record<string, unknown> };
    const value = cf.env?.["TRUSTED_VPN_BROWSER_SECRET"];
    if (typeof value === "string" && value.trim()) return value;
  } catch { /* Node/Vercel has no native Worker module. */ }
  const value = typeof process === "undefined" ? undefined : process.env["TRUSTED_VPN_BROWSER_SECRET"];
  return typeof value === "string" && value.trim() ? value : null;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`tftt-trusted-vpn::${secret}`),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function issueTrustedVpnToken(secret: string | null, now = Date.now()): Promise<string> {
  if (!secret) throw new Error("Trusted VPN browsing is unavailable: signing secret missing");
  const issued = Math.floor(now / 1000);
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  const payload = `v1.${nonce}.${issued}.${issued + TRUSTED_VPN_MAX_AGE}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(payload));
  return `${payload}.${hex(new Uint8Array(signature))}`;
}

export async function verifyTrustedVpnToken(value: string | null, secret: string | null, now = Date.now()): Promise<number | null> {
  try {
    if (!secret || !value || value.length > 256) return null;
    const match = /^v1\.([a-f0-9]{64})\.([0-9]{1,12})\.([0-9]{1,12})\.([a-f0-9]{64})$/.exec(value);
    if (!match) return null;
    const issued = Number(match[2]), expires = Number(match[3]), seconds = Math.floor(now / 1000);
    if (issued > seconds || expires <= seconds || expires - issued !== TRUSTED_VPN_MAX_AGE) return null;
    const signature = Uint8Array.from(match[4].match(/../g) ?? [], b => parseInt(b, 16));
    // Native HMAC verification avoids a timing-dependent JS signature comparison.
    const valid = await crypto.subtle.verify("HMAC", await signingKey(secret), signature,
      new TextEncoder().encode(value.slice(0, value.lastIndexOf("."))));
    return valid ? expires * 1000 : null;
  } catch { return null; }
}

export function trustedVpnCookieValue(request: Request): string | null {
  const values = (request.headers.get("cookie") ?? "").split(";")
    .map(part => part.trim()).filter(part => part.startsWith(`${TRUSTED_VPN_COOKIE}=`));
  // Reject ambiguous duplicate cookies rather than choosing a potentially shadowed value.
  return values.length === 1 ? values[0].slice(TRUSTED_VPN_COOKIE.length + 1) : null;
}

export async function trustedVpnExpiry(request: Request): Promise<number | null> {
  const token = trustedVpnCookieValue(request);
  if (!token) return null;
  return verifyTrustedVpnToken(token, await trustedVpnSecret(request));
}

export async function isTrustedVpnBrowser(request: Request): Promise<boolean> {
  return (await trustedVpnExpiry(request)) !== null;
}

export function trustedVpnCookieHeader(request: Request, token: string | null): string {
  const secure = new URL(request.url).protocol === "https:";
  return `${TRUSTED_VPN_COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? TRUSTED_VPN_MAX_AGE : 0}${secure ? "; Secure" : ""}`;
}