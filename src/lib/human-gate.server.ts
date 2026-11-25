// First-request anti-abuse gate. No Supabase calls, no analytics, no new dependencies.
// Cloudflare bindings are location-local; bounded per-isolate counters are a fallback.
const VERIFY_PATH = "/api/human-verify";
const COOKIE = "__Host-tftt-human";
const ACTION = "tftt_human";
const TRUST_SECONDS = 12 * 60 * 60;
const WINDOW_MS = 60_000;
const MAX_KEYS = 5000;
const SUSPICIOUS_MS = 10 * WINDOW_MS;
type Binding = "BOT_NAV_RATE_LIMITER" | "BOT_REQUEST_RATE_LIMITER" | "BOT_VERIFY_RATE_LIMITER";
type Limiter = { limit: (opts: { key: string }) => Promise<{ success: boolean }> };
type RuntimeRequest = Request & { runtime?: { cloudflare?: { env?: Record<string, unknown> } }; cf?: { asn?: number; botManagement?: { verifiedBot?: boolean } } };
type Config = { sitekey: string; secret: string };

const limits: Record<Binding, number> = { BOT_NAV_RATE_LIMITER: 20, BOT_REQUEST_RATE_LIMITER: 180, BOT_VERIFY_RATE_LIMITER: 8 };
const counters = new Map<string, { count: number; expires: number }>();
const suspect = new Map<string, number>();
function boundedSet<T>(map: Map<string, T>, key: string, value: T) {
  if (!map.has(key) && map.size >= MAX_KEYS) {
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  }
  map.set(key, value);
}
function env(request: Request, key: string): unknown {
  const bindings = (request as RuntimeRequest).runtime?.cloudflare?.env;
  return bindings ? bindings[key] : typeof process !== "undefined" ? process.env[key] : undefined;
}
function config(request: Request): Config | null {
  const sitekey = env(request, "TURNSTILE_SITE_KEY");
  const secret = env(request, "TURNSTILE_SECRET_KEY");
  // The production widget must not use Cloudflare's public test credentials.
  if (typeof sitekey !== "string" || typeof secret !== "string" ||
      !/^[A-Za-z0-9_-]{10,120}$/.test(sitekey) || !secret.trim() ||
      /^[123]x0{10,}/.test(sitekey) || /^[123]x0{10,}/.test(secret)) return null;
  return { sitekey, secret };
}
function ipOf(request: Request): string | null {
  // Use the hosting router's existing CF header, never a JSON field, query,
  // arbitrary forwarded-for header, or user-agent claim.
  const ip = request.headers.get("cf-connecting-ip");
  return ip && ip.length <= 45 && /^[0-9a-f:.]+$/i.test(ip) ? ip : null;
}
function verifiedCrawler(request: Request): boolean {
  return (request as RuntimeRequest).cf?.botManagement?.verifiedBot === true;
}
async function allowed(request: Request, binding: Binding, ip: string): Promise<boolean> {
  const bound = env(request, binding) as Limiter | undefined;
  if (bound && typeof bound.limit === "function") {
    try { return (await bound.limit({ key: "tftt:" + ip })).success; } catch { /* fall back */ }
  }
  const now = Date.now();
  const key = binding + ":" + ip;
  const previous = counters.get(key);
  const next = previous && previous.expires > now
    ? { count: previous.count + 1, expires: previous.expires }
    : { count: 1, expires: now + WINDOW_MS };
  boundedSet(counters, key, next);
  return next.count <= limits[binding];
}
function markSuspect(ip: string) {
  boundedSet(suspect, ip, Date.now() + SUSPICIOUS_MS);
}
/** Feed only server-confirmed high-confidence proxy/Tor detections from the existing monitor. */
export function noteSuspiciousNetwork(request: Request): void {
  const ip = ipOf(request);
  if (ip && !verifiedCrawler(request)) markSuspect(ip);
}
function publicDynamic(path: string): boolean {
  if (path === "/api/site-version" || path === "/robots.txt" || path === "/sitemap.xml" ||
      path === "/favicon.ico" || path === "/sw.js" || path === "/manifest.webmanifest") return false;
  if (/^\/(?:assets|publication-covers|original-series-covers|@|node_modules|src)\//.test(path)) return false;
  return !/\.(?:css|js|mjs|woff2?|png|jpe?g|webp|gif|svg|ico|xml|txt)$/i.test(path);
}
function navigation(request: Request, path: string): boolean {
  return request.method === "GET" && !/^\/(?:api|_serverFn|admin)(?:\/|$|-)/.test(path) &&
    (request.headers.get("accept") ?? "").includes("text/html");
}
const safeHeaders = () => ({
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});
function response(request: Request, status: number, message: string, retry = false): Response {
  return new Response(request.method === "HEAD" ? null : message, {
    status, headers: { ...safeHeaders(), "Content-Type": "text/plain; charset=utf-8", ...(retry ? { "Retry-After": "60" } : {}) },
  });
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode("tftt-human-v1:" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function context(request: Request, ip: string, payload: string) {
  return new TextEncoder().encode(payload + "\n" + ip + "\n" + (request.headers.get("user-agent") ?? "").slice(0, 1000));
}
async function issue(request: Request, ip: string, secret: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + TRUST_SECONDS;
  const payload = "v1." + expires + "." + hex(crypto.getRandomValues(new Uint8Array(16)));
  const sig = await crypto.subtle.sign("HMAC", await signingKey(secret), context(request, ip, payload));
  return payload + "." + hex(new Uint8Array(sig));
}
async function trusted(request: Request, ip: string, secret: string): Promise<boolean> {
  try {
    const values = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim())
      .filter(v => v.startsWith(COOKIE + "="));
    if (values.length !== 1) return false;
    const token = values[0].slice(COOKIE.length + 1);
    const match = /^v1\.([0-9]{1,12})\.([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token);
    if (!match) return false;
    const now = Math.floor(Date.now() / 1000);
    const expires = Number(match[1]);
    if (expires <= now || expires > now + TRUST_SECONDS) return false;
    const sig = Uint8Array.from(match[3].match(/../g) ?? [], b => parseInt(b, 16));
    return await crypto.subtle.verify("HMAC", await signingKey(secret), sig,
      context(request, ip, token.slice(0, token.lastIndexOf("."))));
  } catch { return false; }
}
function safeReturn(value: string | null, origin: string): string {
  if (!value || value.length > 2000 || !value.startsWith("/") || value.startsWith("//") ||
      /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.pathname === VERIFY_PATH) return "/";
    return url.pathname + url.search;
  } catch { return "/"; }
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
function challenge(request: Request, cfg: Config, returnTo: string): Response {
  const page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Verify you are human | Torah For The Table</title><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f2e7;color:#1b2a4a;font-family:system-ui,sans-serif;padding:16px;box-sizing:border-box}main{width:min(100%,420px);text-align:center;background:#fffdf8;border:1px solid #d8c59e;border-radius:14px;padding:28px;box-sizing:border-box}h1{font:700 1.05rem Georgia,serif;color:#8d6b2d}h2{font:700 1.8rem Georgia,serif}p{line-height:1.5;color:#45536d}button{display:block;width:100%;padding:13px;border:0;border-radius:6px;background:#1b2a4a;color:white;font:600 1rem system-ui;cursor:pointer;margin-top:16px}button:focus-visible{outline:3px solid #b08a3e;outline-offset:3px}.cf-turnstile{display:flex;justify-content:center;min-height:65px}</style></head><body><main><h1>Torah For The Table</h1><h2>Verify you are human</h2><p>This brief security check helps keep our weekly Divrei Torah available to everyone.</p><form method="post" action="' + VERIFY_PATH + '"><input type="hidden" name="return_to" value="' + escapeHtml(returnTo) + '"><div class="cf-turnstile" data-sitekey="' + escapeHtml(cfg.sitekey) + '" data-action="' + ACTION + '" data-size="flexible"></div><button type="submit">Continue to website</button></form><noscript><p>Please enable JavaScript and reload to complete verification.</p></noscript></main></body></html>';
  return new Response(request.method === "HEAD" ? null : page, {
    status: 403, headers: { ...safeHeaders(), "Content-Type": "text/html; charset=utf-8",
      "X-TFTT-Gate": "human-verification",
      "Content-Security-Policy": "default-src 'none'; script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'unsafe-inline'; connect-src https://challenges.cloudflare.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
async function readSmallForm(request: Request): Promise<URLSearchParams | null> {
  if (!(request.headers.get("content-type") ?? "").startsWith("application/x-www-form-urlencoded") || !request.body) return null;
  const reader = request.body.getReader();
  let size = 0, body = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return null; }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return new URLSearchParams(body);
  } catch { return null; } finally { reader.releaseLock(); }
}
async function verification(request: Request, url: URL, ip: string | null, cfg: Config | null): Promise<Response> {
  if (!ip || !cfg || url.protocol !== "https:") return response(request, 503, "Verification is currently unavailable.");
  if (request.method === "GET") return challenge(request, cfg, safeReturn(url.searchParams.get("return_to"), url.origin));
  if (request.method !== "POST") return response(request, 405, "Method not allowed.");
  if (request.headers.get("origin") !== url.origin) return response(request, 403, "Verification must originate from this website.");
  if (!(await allowed(request, "BOT_VERIFY_RATE_LIMITER", ip))) return response(request, 429, "Too many verification attempts. Please retry in one minute.", true);
  const form = await readSmallForm(request);
  const token = form?.get("cf-turnstile-response");
  const returnTo = safeReturn(form?.get("return_to") ?? null, url.origin);
  if (!token || token.length > 2048 || form?.getAll("cf-turnstile-response").length !== 1) return challenge(request, cfg, returnTo);
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: new URLSearchParams({ secret: cfg.secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    if (!result.ok) return response(request, 503, "Verification is temporarily unavailable. Please retry.");
    const data = await result.json() as { success?: boolean; hostname?: string; action?: string };
    if (data.success !== true || data.hostname !== url.hostname || data.action !== ACTION) return challenge(request, cfg, returnTo);
    const signed = await issue(request, ip, cfg.secret);
    return new Response(null, { status: 303, headers: { ...safeHeaders(), Location: returnTo,
      "Set-Cookie": COOKIE + "=" + signed + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + TRUST_SECONDS } });
  } catch { return response(request, 503, "Verification is temporarily unavailable. Please retry."); }
}
export async function checkHumanGate(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const ip = ipOf(request);
  const cfg = config(request);
  if (url.pathname === VERIFY_PATH) return verification(request, url, ip, cfg);
  if (!ip || verifiedCrawler(request) || !publicDynamic(url.pathname)) return null;
  if (!(await allowed(request, "BOT_REQUEST_RATE_LIMITER", ip))) {
    markSuspect(ip);
    return response(request, 429, "Too many requests. Please retry in one minute.", true);
  }
  if (!navigation(request, url.pathname)) return null;
  if (!(await allowed(request, "BOT_NAV_RATE_LIMITER", ip))) markSuspect(ip);
  if ((request as RuntimeRequest).cf?.asn === 45102) markSuspect(ip);
  if (!cfg || url.protocol !== "https:" || (suspect.get(ip) ?? 0) <= Date.now()) return null;
  if (await trusted(request, ip, cfg.secret)) return null;
  return challenge(request, cfg, safeReturn(url.pathname + url.search, url.origin));
}
