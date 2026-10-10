// Pure helpers for the server-side "Maintenance traffic" tracker (client-safe,
// no secrets). Decides which requests count, sanitizes stored fields, and
// summarizes rows for the admin report. Rows live only in the Lovable Cloud
// table public.maintenance_visits — never in canonical analytics.

export type MaintenanceClassification = "likely_human" | "automation" | "unknown";
export type DeviceBucket = "mobile" | "tablet" | "desktop" | "unknown";

const STATIC_EXT = /\.(?:js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|txt|xml|json|webmanifest|pdf|woff2?|ttf|otf|mp4|mp3|zip)$/i;
const EXCLUDED_PREFIXES = ["/admin", "/api", "/assets", "/_serverFn", "/_build", "/@", "/node_modules", "/src/", "/view/", "/og.image"];
const REDIRECT_PATHS = new Set(["/r", "/s", "/j", "/wa", "/offline"]);

/** Request-level eligibility (before the response is known). */
export function isTrackableNavigation(request: Request): boolean {
  if (request.method !== "GET") return false;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".lovableproject.com") || host.startsWith("id-preview--") || host.includes("preview--")) return false;
  const path = url.pathname;
  if (EXCLUDED_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p))) return false;
  if (REDIRECT_PATHS.has(path) || STATIC_EXT.test(path) || path.startsWith("/favicon") || path === "/sw.js") return false;
  if (url.searchParams.has("_serverFnId") || url.searchParams.has("__lovable")) return false;
  const h = request.headers;
  const purpose = `${h.get("sec-purpose") ?? ""} ${h.get("purpose") ?? ""} ${h.get("x-purpose") ?? ""}`.toLowerCase();
  if (purpose.includes("prefetch") || purpose.includes("prerender") || purpose.includes("preview")) return false;
  const dest = h.get("sec-fetch-dest");
  if (dest && dest !== "document") return false;
  const mode = h.get("sec-fetch-mode");
  if (mode && mode !== "navigate") return false;
  if (h.get("x-tsr-redirect") || h.get("x-tss-serverfn")) return false;
  const accept = (h.get("accept") ?? "").toLowerCase();
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return false;
  const ref = (h.get("referer") ?? "").toLowerCase();
  if (/(^|\/\/|\.)lovable\.(dev|app)\b|lovableproject\.com/.test(ref)) return false;
  return true;
}

/** Response-level check: only a real 200 HTML document counts. */
export function isServedHtmlDocument(response: Response | undefined | null): boolean {
  if (!response || response.status !== 200) return false;
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

export function classifyRequest(request: Request, isAutomated: (ua: string) => boolean): MaintenanceClassification {
  const ua = request.headers.get("user-agent") ?? "";
  if (isAutomated(ua)) return "automation";
  const h = request.headers;
  const browserish = /Mozilla\/5\.0/.test(ua);
  const navigate = h.get("sec-fetch-mode") === "navigate" && h.get("sec-fetch-dest") === "document";
  const lang = !!h.get("accept-language");
  if (browserish && navigate && lang) return "likely_human";
  return "unknown";
}

export function deviceBucket(ua: string, chMobile?: string | null): DeviceBucket {
  if (!ua) return "unknown";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (chMobile === "?1" || /Mobi|iPhone|Android/i.test(ua)) return "mobile";
  if (/Windows|Macintosh|X11|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}

/** External referring domain only (no path/query); own domains dropped. */
export function referrerDomain(referer: string | null | undefined, ownHost: string): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
    const own = ownHost.toLowerCase().replace(/^www\./, "");
    if (!host || host === own || /(^|\.)torahforthetable\.(com|org)$/.test(host)) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

export function sanitizePath(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname.slice(0, 200) || "/";
  } catch {
    return "/";
  }
}

export function cleanGeo(v: string | null | undefined, max = 80): string | null {
  const t = (v ?? "").trim();
  if (!t || t.toUpperCase() === "XX" || t.toUpperCase() === "T1") return null;
  return t.slice(0, max);
}

// ---------- Reporting ----------

export type MaintenanceVisitRow = {
  created_at: string;
  path: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string;
  referrer_domain: string | null;
  classification: string;
  visitor_key: string | null;
};

export const NY_TZ = "America/New_York";

export function formatNy(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ, year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

function nyParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) };
}

/** UTC instant for 00:00 America/New_York on a YYYY-MM-DD date (DST-aware). */
export function nyMidnightUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, 5, 0, 0);
  for (const offset of [4, 5]) {
    const t = Date.UTC(y!, m! - 1, d!, offset, 0, 0);
    const p = nyParts(new Date(t).toISOString());
    if (p.day === ymd && p.hour === 0) return new Date(t);
  }
  return new Date(guess);
}

function tally(rows: MaintenanceVisitRow[], key: (r: MaintenanceVisitRow) => string, top = 15) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top).map(([label, count]) => ({ label, count }));
}

export function locationLabel(r: Pick<MaintenanceVisitRow, "city" | "region" | "country">): string {
  if (r.city) return [r.city, r.region, r.country].filter(Boolean).join(", ");
  return r.country ? `${r.country} (city unknown)` : "Location unknown";
}

export function summarizeMaintenanceVisits(rows: MaintenanceVisitRow[]) {
  const by = (c: string) => rows.filter((r) => r.classification === c);
  const uniq = (rs: MaintenanceVisitRow[]) => new Set(rs.map((r) => r.visitor_key).filter(Boolean)).size;
  const human = by("likely_human");
  return {
    totalRequests: rows.length,
    estimatedUniqueVisitors: uniq(rows),
    likelyHuman: human.length,
    likelyHumanEstimatedUnique: uniq(human),
    automation: by("automation").length,
    unknown: by("unknown").length,
    byDay: tally(rows, (r) => nyParts(r.created_at).day, 60).sort((a, b) => a.label.localeCompare(b.label)),
    byHourNy: tally(rows, (r) => String(nyParts(r.created_at).hour).padStart(2, "0") + ":00", 24).sort((a, b) => a.label.localeCompare(b.label)),
    devices: tally(rows, (r) => r.device || "unknown"),
    countries: tally(rows, (r) => r.country ?? "Location unknown"),
    cities: tally(rows, (r) => locationLabel(r)),
    referrers: tally(rows, (r) => r.referrer_domain ?? "Direct / none"),
    paths: tally(rows, (r) => r.path),
  };
}
