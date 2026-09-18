// Server-only helpers that derive request telemetry from trustworthy edge data.
//
// Everything here comes from headers set by the hosting edge or from the
// Cloudflare request object. Nothing is ever accepted from a JSON request body,
// and no external IP/geo lookup service is called.

export type RequestTelemetry = {
  ipAddress: string | null;
  userAgent: string;
  acceptLanguage: string | null;
  secChUa: string | null;
  secChPlatform: string | null;
  secChMobile: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  asn: number | null;
  asOrganization: string | null;
};

function headerValue(request: Request, name: string): string | null {
  const v = request.headers.get(name);
  return v && v.trim() ? v.trim() : null;
}

/** Vercel geo headers are RFC3986-encoded and can be malformed; never throw. */
function decodeGeo(value: string | null): string | null {
  if (!value) return null;
  let out = value;
  try {
    out = decodeURIComponent(value);
  } catch {
    out = value;
  }
  const trimmed = out.trim().slice(0, 120);
  return trimmed ? trimmed : null;
}

/**
 * Prefer edge/proxy headers over the connection's remote address. Never accept
 * an IP from a request body.
 */
export function getClientIP(request: Request): string | null {
  const cf = headerValue(request, "cf-connecting-ip");
  if (cf) return cf.slice(0, 100);

  const real = headerValue(request, "x-real-ip");
  if (real) return real.slice(0, 100);

  const forwarded = headerValue(request, "x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0];
    const trimmed = first?.trim();
    if (trimmed) return trimmed.slice(0, 100);
  }

  return null;
}

export function getRequestTelemetry(request: Request): RequestTelemetry {
  const cf = (request as unknown as { cf?: Record<string, unknown> }).cf ?? {};
  const cfStr = (key: string) => {
    const v = cf[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  // ASN / network organization only when the edge runtime actually exposes it.
  // Never derived from an external lookup service.
  const rawAsn = cf["asn"];
  const asnNumber =
    typeof rawAsn === "number" && Number.isFinite(rawAsn)
      ? Math.trunc(rawAsn)
      : typeof rawAsn === "string" && /^\d+$/.test(rawAsn.trim())
        ? Number.parseInt(rawAsn.trim(), 10)
        : null;

  const country =
    headerValue(request, "x-vercel-ip-country") ??
    cfStr("country") ??
    headerValue(request, "cf-ipcountry") ??
    null;

  return {
    ipAddress: getClientIP(request),
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 1000),
    acceptLanguage: headerValue(request, "accept-language")?.slice(0, 300) ?? null,
    secChUa: headerValue(request, "sec-ch-ua")?.slice(0, 400) ?? null,
    secChPlatform: headerValue(request, "sec-ch-ua-platform")?.slice(0, 100) ?? null,
    secChMobile: headerValue(request, "sec-ch-ua-mobile")?.slice(0, 20) ?? null,
    country: country ? country.slice(0, 10) : null,
    region:
      headerValue(request, "x-vercel-ip-country-region") ??
      cfStr("region") ??
      cfStr("regionCode") ??
      null,
    city: decodeGeo(headerValue(request, "x-vercel-ip-city")) ?? cfStr("city") ?? null,
    postalCode:
      decodeGeo(headerValue(request, "x-vercel-ip-postal-code")) ?? cfStr("postalCode") ?? null,
    asn: asnNumber,
    asOrganization: cfStr("asOrganization")?.slice(0, 200) ?? null,
  };
}

/**
 * Conservative automation check shared by the analytics ingest endpoints. The
 * raw User-Agent header is matched against obvious bot/crawler/headless/
 * link-preview markers before anything is persisted.
 */
const BOT_UA = new RegExp(
  [
    "bot",
    "crawler",
    "spider",
    "crawling",
    "headless",
    "puppeteer",
    "playwright",
    "phantomjs",
    "selenium",
    "lighthouse",
    "pagespeed",
    "curl/",
    "wget",
    "python-requests",
    "axios/",
    "node-fetch",
    "go-http-client",
    "java/",
    "okhttp",
    "libwww-perl",
    "httpclient",
    "monitoring",
    "uptime",
    "preview",
    "facebookexternalhit",
    "whatsapp",
    "telegrambot",
    "slackbot",
    "discordbot",
    "twitterbot",
    "linkedinbot",
    "embedly",
    "quora link preview",
    "skypeuripreview",
    "vkshare",
    "redditbot",
    "applebot",
    "bingpreview",
    "google-inspectiontool",
    "chrome-lighthouse",
  ].join("|"),
  "i",
);

export function isAutomatedAgent(ua: string): boolean {
  if (!ua.trim()) return true; // no UA at all is never a normal browser
  return BOT_UA.test(ua);
}

export function isAdminPath(p: string | null | undefined): boolean {
  if (!p) return false;
  return p === "/admin" || p.startsWith("/admin/") || p.startsWith("/admin-analytics");
}
