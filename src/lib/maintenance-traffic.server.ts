// Server-only recorder for maintenance-screen hits. Best-effort, fail-open,
// never stores raw IP/UA/query strings. No alerts are sent.
import { isAdminPath } from "./maintenance";
import {
  classifyRequest, cleanGeo, deviceBucket, isServedHtmlDocument, isTrackableNavigation,
  referrerDomain, sanitizePath,
} from "./maintenance-traffic";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [n, ...rest] = part.trim().split("=");
    if (n === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return null; }
    }
  }
  return null;
}

async function hmac(message: string): Promise<string> {
  const secret = process.env["EXT_SUPABASE_SERVICE_ROLE_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"] || "";
  if (!secret) throw new Error("no key");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(`tftt-maint-visitor::${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function nyDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type MaintenanceVisitInsert = {
  path: string; country: string | null; region: string | null; city: string | null;
  device: string; referrer_domain: string | null; classification: string;
  visitor_key: string | null; visitor_key_source: string | null;
};

export type TrackDeps = {
  maintenanceEnabled: () => Promise<boolean>;
  isInternal: (r: Request) => Promise<boolean>;
  insert: (row: MaintenanceVisitInsert) => Promise<void>;
  now?: Date;
};

/** Builds the sanitized row (or null when the request must not be counted). */
export async function buildMaintenanceVisit(request: Request, response: Response | null | undefined, deps: TrackDeps): Promise<MaintenanceVisitInsert | null> {
  if (!isTrackableNavigation(request) || !isServedHtmlDocument(response)) return null;
  const url = new URL(request.url);
  if (isAdminPath(url.pathname)) return null;
  if (!(await deps.maintenanceEnabled())) return null;
  if (await deps.isInternal(request)) return null;

  const { getRequestTelemetry, isAutomatedAgent } = await import("./request-telemetry.server");
  const t = getRequestTelemetry(request);
  const vid = readCookie(request, "tftt_vid");
  let visitor_key: string | null = null;
  let visitor_key_source: string | null = null;
  try {
    if (vid && /^[A-Za-z0-9_-]{8,80}$/.test(vid)) {
      visitor_key = await hmac(`vid:${vid}`);
      visitor_key_source = "first_party_cookie";
    } else if (t.ipAddress) {
      // Bounded to one New York day: an estimate, never a cross-day identity.
      visitor_key = await hmac(`ipua:${t.ipAddress}|${t.userAgent}|${nyDay(deps.now ?? new Date())}`);
      visitor_key_source = "daily_network_hash";
    }
  } catch { /* key unavailable: leave null */ }

  return {
    path: sanitizePath(request.url),
    country: cleanGeo(t.country, 10),
    region: cleanGeo(t.region),
    city: cleanGeo(t.city),
    device: deviceBucket(t.userAgent, t.secChMobile),
    referrer_domain: referrerDomain(request.headers.get("referer"), url.hostname),
    classification: classifyRequest(request, isAutomatedAgent),
    visitor_key,
    visitor_key_source,
  };
}

export async function trackMaintenanceVisit(request: Request, response: Response | null | undefined, deps: TrackDeps): Promise<boolean> {
  try {
    const row = await buildMaintenanceVisit(request, response, deps);
    if (!row) return false;
    await deps.insert(row);
    return true;
  } catch (err) {
    console.error("[maintenance-traffic] record failed", (err as Error)?.message);
    return false;
  }
}

export async function defaultTrackDeps(): Promise<TrackDeps> {
  const { readMaintenanceEnabled } = await import("./maintenance.server");
  const { isInternalRequest } = await import("./internal-marker.server");
  return {
    maintenanceEnabled: () => readMaintenanceEnabled(),
    isInternal: isInternalRequest,
    insert: async (row) => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("maintenance_visits").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}

/** Called from request middleware after the response exists. Never throws, never delays long. */
export async function recordMaintenanceVisitFromMiddleware(request: Request, response: Response | undefined) {
  if (!isTrackableNavigation(request) || !isServedHtmlDocument(response)) return;
  const work = (async () => trackMaintenanceVisit(request, response, await defaultTrackDeps()))().catch(() => false);
  const ctx = (request as unknown as { runtime?: { cloudflare?: { context?: { waitUntil?: (p: Promise<unknown>) => void } } } })
    .runtime?.cloudflare?.context;
  if (ctx?.waitUntil) {
    ctx.waitUntil(work);
    return;
  }
  // No waitUntil available: wait at most 300ms, then let the response go.
  await Promise.race([work, new Promise((r) => setTimeout(r, 300))]);
}
