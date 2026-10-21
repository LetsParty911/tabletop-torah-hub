/**
 * Server-only, visitor-local Shabbos/Yom Tov gate.
 *
 * Must run after the existing VPN and geo/IP blocks. Never modifies or
 * replaces the persistent manual maintenance setting.
 *
 * Uses IP-based approximate coordinates (not the visitor's device location).
 * Hebcal's experimental "im=1" service defines the prohibition from local
 * sunset until nightfall at a solar depression of 8.5 degrees, and accounts
 * for Israel versus Diaspora. For unresolved locations/provider failures,
 * leave the existing website behavior unchanged instead of applying an
 * incorrect timezone or preventing legitimate access worldwide.
 *
 * No visitor IP or location is logged or persisted by this module.
 */
import { getRequestTelemetry, isAutomatedAgent } from "./request-telemetry.server";
import { shouldCheck } from "./geo-block.server";

export type VisitorLocation = {
  latitude: number;
  longitude: number;
  tzid: string;
  city: string;
  region: string;
  country: string;
};
export type ClosureKind = "shabbos" | "yom-tov" | "combined";

const GEO_SUCCESS_TTL_MS = 12 * 60 * 60 * 1000;
const GEO_FAILURE_TTL_MS = 60 * 1000;
const STATUS_TTL_MS = 15 * 1000;
const TIMES_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const PROVIDER_TIMEOUT_MS = 2_000;

const geoCache = new Map<string, { at: number; value: VisitorLocation | null }>();
const geoPending = new Map<string, Promise<VisitorLocation | null>>();
const statusCache = new Map<string, { at: number; value: boolean | null }>();
const statusPending = new Map<string, Promise<boolean | null>>();
const zmanimCache = new Map<string, { at: number; sunset: number | null; tzeit: number | null }>();

function boundedSet<K, V>(cache: Map<K, V>, key: K, value: V): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_ENTRIES) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch { return false; }
}

/** Match the documented ipwho.is geolocation payload, rejecting partial answers. */
export function parseVisitorLocation(payload: unknown): VisitorLocation | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.success !== true) return null;
  const tz = p.timezone;
  const tzid = tz && typeof tz === "object" ? (tz as Record<string, unknown>).id : null;
  const { latitude, longitude, city, region, country_code } = p;
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
    typeof tzid !== "string" || !isValidTimezone(tzid) ||
    typeof city !== "string" || !city.trim() ||
    typeof country_code !== "string" || !/^[a-z]{2}$/i.test(country_code)
  ) return null;
  // A US country-level response must not be mistaken for the visitor's city.
  if (country_code.toUpperCase() === "US" && (typeof region !== "string" || !region.trim())) return null;
  return {
    latitude, longitude, tzid,
    city: city.trim().slice(0, 120),
    region: typeof region === "string" ? region.trim().slice(0, 120) : "",
    country: country_code.toUpperCase(),
  };
}

function suitableIp(ip: string): boolean {
  if (!/^[0-9a-f:.]+$/i.test(ip) || ip.length > 45) return false;
  const v = ip.toLowerCase();
  if (
    v === "::1" || v.startsWith("127.") || v.startsWith("10.") ||
    v.startsWith("192.168.") || v.startsWith("169.254.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(v) ||
    v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:")
  ) return false;
  return true;
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return json && typeof json === "object" && !Array.isArray(json)
      ? json as Record<string, unknown> : null;
  } catch { return null; }
}

async function resolveVisitor(
  ip: string, edgeCountry: string | null, now: Date, fetcher: typeof fetch,
): Promise<VisitorLocation | null> {
  const cached = geoCache.get(ip);
  if (cached && now.getTime() - cached.at <
    (cached.value ? GEO_SUCCESS_TTL_MS : GEO_FAILURE_TTL_MS)) return cached.value;
  const prior = geoPending.get(ip);
  if (prior) return prior;
  const pending = (async () => {
    const url = "https://ipwho.is/" + encodeURIComponent(ip) +
      "?fields=success,country_code,region,city,latitude,longitude,timezone";
    const geo = parseVisitorLocation(await fetchJson(url, fetcher));
    const expectedCountry = (edgeCountry ?? "").trim().toUpperCase();
    // Do not enforce a closure using contradictory edge/IP-geolocation countries.
    const value = geo && expectedCountry && !["XX", "T1"].includes(expectedCountry) &&
      expectedCountry !== geo.country ? null : geo;
    boundedSet(geoCache, ip, { at: now.getTime(), value });
    return value;
  })().finally(() => { geoPending.delete(ip); });
  geoPending.set(ip, pending);
  return pending;
}

/** Explicit coordinates and tzid, not a fixed Eastern-time calendar. */
export function buildAssurUrl(location: VisitorLocation, instant: Date): string {
  const url = new URL("https://www.hebcal.com/zmanim");
  url.searchParams.set("cfg", "json");
  url.searchParams.set("im", "1");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("tzid", location.tzid);
  url.searchParams.set("dt", instant.toISOString());
  // Latitude/longitude requests otherwise default to Diaspora.
  if (location.country === "IL") url.searchParams.set("i", "on");
  return url.toString();
}

export function parseAssurStatus(payload: unknown): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  const status = (payload as Record<string, unknown>).status;
  if (!status || typeof status !== "object") return null;
  const value = (status as Record<string, unknown>).isAssurBemlacha;
  return typeof value === "boolean" ? value : null;
}

async function isAssurNow(
  location: VisitorLocation, now: Date, fetcher: typeof fetch,
): Promise<boolean | null> {
  const key = [location.latitude, location.longitude, location.tzid, location.country].join("|");
  const cached = statusCache.get(key);
  if (cached && now.getTime() - cached.at < STATUS_TTL_MS) return cached.value;
  const prior = statusPending.get(key);
  if (prior) return prior;
  const pending = (async () => {
    const result = parseAssurStatus(await fetchJson(buildAssurUrl(location, now), fetcher));
    boundedSet(statusCache, key, { at: now.getTime(), value: result });
    return result;
  })().finally(() => { statusPending.delete(key); });
  statusPending.set(key, pending);
  return pending;
}

/** Stable local weekday + calendar date, including DST and date boundaries. */
export function localDateParts(now: Date, tzid: string): { weekday: string; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tzid, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(x => x.type === type)?.value ?? "";
  return {
    weekday: part("weekday"),
    date: [part("year"), part("month"), part("day")].join("-"),
  };
}

function buildDailyZmanimUrl(location: VisitorLocation, date: string): string {
  const url = new URL("https://www.hebcal.com/zmanim");
  url.searchParams.set("cfg", "json");
  url.searchParams.set("date", date);
  url.searchParams.set("sec", "1");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("tzid", location.tzid);
  return url.toString();
}

async function dailyTimes(
  location: VisitorLocation, date: string, now: Date, fetcher: typeof fetch,
): Promise<{ sunset: number | null; tzeit: number | null }> {
  const key = [location.latitude, location.longitude, location.tzid, date].join("|");
  const cached = zmanimCache.get(key);
  if (cached && now.getTime() - cached.at < TIMES_TTL_MS) {
    return { sunset: cached.sunset, tzeit: cached.tzeit };
  }
  const data = await fetchJson(buildDailyZmanimUrl(location, date), fetcher);
  const times = data?.times && typeof data.times === "object"
    ? data.times as Record<string, unknown> : {};
  const parseMoment = (value: unknown): number | null => {
    if (typeof value !== "string" || !/[zZ]|[+-]\d\d:\d\d$/.test(value)) return null;
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
  };
  const value = {
    sunset: parseMoment(times.sunset),
    tzeit: parseMoment(times.tzeit85deg),
  };
  // Cache only complete answers: outages or polar latitudes must be retried.
  if (value.sunset !== null && value.tzeit !== null) {
    boundedSet(zmanimCache, key, { at: now.getTime(), ...value });
  }
  return value;
}

/**
 * Positive isAssurBemlacha is authoritative. On civil Friday/Saturday, use
 * the same location's sunset/tzeit to distinguish Yom Tov from Shabbos.
 * Unavailable detail yields accurate general-purpose wording rather than a
 * misleading "Motzei Shabbos" promise for a continuing Yom Tov.
 */
export async function classifyClosure(
  location: VisitorLocation, now: Date, fetcher: typeof fetch,
): Promise<ClosureKind> {
  const { weekday, date } = localDateParts(now, location.tzid);
  if (weekday !== "Friday" && weekday !== "Saturday") return "yom-tov";
  const { sunset, tzeit } = await dailyTimes(location, date, now, fetcher);
  if (weekday === "Friday") {
    if (sunset === null) return "combined";
    return now.getTime() >= sunset ? "shabbos" : "yom-tov";
  }
  if (tzeit === null) return "combined";
  return now.getTime() < tzeit ? "shabbos" : "yom-tov";
}

/**
 * No persisted visitors, no country-wide assumptions, no manual setting writes.
 * The hosting edge's cf-connecting-ip/x-real-ip is preferred to untrusted
 * X-Forwarded-For when this function is used for access control.
 */
export async function getVisitorClosure(
  request: Request, now: Date = new Date(), fetcher: typeof fetch = fetch,
): Promise<ClosureKind | null> {
  const t = getRequestTelemetry(request);
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  if (!ip || !suitableIp(ip.trim())) return null;
  const geo = await resolveVisitor(ip.trim(), t.country, now, fetcher);
  if (!geo) return null;
  const status = await isAssurNow(geo, now, fetcher);
  return status === true ? classifyClosure(geo, now, fetcher) : null;
}

const COPY: Record<ClosureKind, { heading: string; message: string; returnText: string }> = {
  shabbos: {
    heading: "Closed for Shabbos",
    message: "We are closed for Shabbos.",
    returnText: "Please revisit Motzei Shabbos, or after Yom Tov if it continues.",
  },
  "yom-tov": {
    heading: "Closed for Yom Tov",
    message: "We are closed for Yom Tov.",
    returnText: "Please revisit after Yom Tov ends.",
  },
  combined: {
    heading: "Closed for Shabbos or Yom Tov",
    message: "We are closed for Shabbos or Yom Tov.",
    returnText: "Please revisit after Shabbos or Yom Tov ends.",
  },
};

export function buildClosureResponse(kind: ClosureKind, method = "GET"): Response {
  const copy = COPY[kind];
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    '<title>' + copy.heading + ' — Torah For The Table</title>' +
    '<style>body{box-sizing:border-box;min-height:100vh;margin:0;display:grid;' +
    'place-items:center;padding:24px;background:#f7f2e7;color:#1b2a4a;' +
    'font-family:Georgia,serif;text-align:center}main{max-width:620px}' +
    '.brand{color:#987327;letter-spacing:.12em;font-size:1.05rem}' +
    'h1{font-size:clamp(2rem,6vw,3.3rem);margin:24px 0 18px}' +
    'p{font-family:system-ui,sans-serif;font-size:1.1rem;line-height:1.6}' +
    'small{font-family:system-ui,sans-serif;color:#57637b}' +
    '</style></head><body><main><div class="brand">TORAH FOR THE TABLE</div>' +
    '<h1>' + copy.heading + '</h1><p>' + copy.message + '</p>' +
    '<p>' + copy.returnText + '</p><p>Thank you for your understanding.</p>' +
    '<small>Times calculated with data from Hebcal.com. Reload after the holiday ends.</small>' +
    '</main></body></html>';
  return new Response(method === "HEAD" ? null : html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "Retry-After": "120",
      "X-Robots-Tag": "noindex",
      "X-TFTT-Gate": "shabbos-yom-tov",
    },
  });
}

/**
 * Keeps admin controls, assets, bots, manual maintenance and existing security
 * gates unaffected. Only public page navigation and PDF route requests pass
 * through the local holiday check.
 */
export async function checkShabbosGate(request: Request): Promise<Response | null> {
  try {
    const path = new URL(request.url).pathname;
    if (!shouldCheck(request, path)) return null;
    if (isAutomatedAgent(request.headers.get("user-agent") ?? "")) return null;
    const { isInternalRequest } = await import("./internal-marker.server");
    if (await isInternalRequest(request)) return null;
    const { readMaintenanceEnabled } = await import("./maintenance.server");
    if (await readMaintenanceEnabled()) return null;
    const kind = await getVisitorClosure(request);
    return kind ? buildClosureResponse(kind, request.method) : null;
  } catch (error) {
    console.warn("[shabbos-gate] local-calendar lookup unavailable:", (error as Error)?.message);
    return null;
  }
}

export function __clearHolidayGateCacheForTests(): void {
  geoCache.clear(); geoPending.clear();
  statusCache.clear(); statusPending.clear();
  zmanimCache.clear();
}
