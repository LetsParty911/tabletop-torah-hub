// Server-only blocked-city visitor gate.
//
// Flow: request -> resolve IP/geo (existing ip-geo system + cache) -> if the
// visitor matches one of BLOCKED_CITIES, log the attempt to
// public.blocked_visits (Lovable Cloud, separate from every analytics table)
// and return a static 503 maintenance page. Everyone else continues through
// the normal pipeline. Blocked visitors never load the site, so no client
// analytics fire for them.
//
// To add or remove a blocked location, edit BLOCKED_CITIES only.

import { getRequestTelemetry, isAdminPath } from "./request-telemetry.server";
import type { ApproximateGeo } from "./ip-geo.server";

export const BLOCK_ACTION = "maintenance page served";

export type BlockedCity = {
  /** Lower-case city name as reported by the geo provider. */
  city: string;
  /** Accepted region spellings/abbreviations, lower-case. */
  regions: string[];
  /** Lower-case country code. */
  country: string;
  /** Human-readable label used in block_reason. */
  label: string;
};

export const BLOCKED_CITIES: BlockedCity[] = [
  { city: "ashburn", regions: ["virginia", "va"], country: "us", label: "Ashburn, VA" },
  { city: "hackensack", regions: ["new jersey", "nj"], country: "us", label: "Hackensack, NJ" },
  { city: "irvington", regions: ["new jersey", "nj"], country: "us", label: "Irvington, NJ" },
  { city: "cranford", regions: ["new jersey", "nj"], country: "us", label: "Cranford, NJ" },
  { city: "council bluffs", regions: ["iowa", "ia"], country: "us", label: "Council Bluffs, IA" },
  { city: "bayonne", regions: ["new jersey", "nj"], country: "us", label: "Bayonne, NJ" },
];

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Returns the matched blocked city rule, or null. Exact city + region + country only. */
export function matchBlockedCity(geo: {
  city: string | null;
  region: string | null;
  country: string | null;
}): BlockedCity | null {
  const city = norm(geo.city);
  const region = norm(geo.region);
  const country = norm(geo.country);
  return (
    BLOCKED_CITIES.find(
      (r) => r.city === city && r.country === country && r.regions.includes(region),
    ) ?? null
  );
}

export function blockReasonFor(rule: BlockedCity): string {
  return `${rule.label} geo rule`;
}

/** Only real page/document navigations and direct PDF routes are checked. */
export function shouldCheck(request: Request, path: string): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (isAdminPath(path)) return false;
  if (
    path.startsWith("/assets/") ||
    path.startsWith("/api/") ||
    path.startsWith("/_serverFn") ||
    path.startsWith("/@") ||
    path.startsWith("/node_modules/") ||
    path.startsWith("/src/")
  )
    return false;
  if (path.startsWith("/view/")) return true;
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return false; // static files
  return (request.headers.get("accept") ?? "").includes("text/html");
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>TorahForTheTable.com — Temporarily unavailable</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f2e7;color:#1b2a4a;font-family:Georgia,serif;text-align:center;padding:24px}h1{font-size:1.1rem;letter-spacing:.08em;color:#b08a3e;margin:0 0 16px}h2{font-size:2rem;margin:0 0 12px}p{font-family:system-ui,sans-serif;color:#4a5570;margin:0}</style></head><body><main><h1>TorahForTheTable.com</h1><h2>Temporarily unavailable</h2><p>The site is currently undergoing maintenance. Please check back later.</p></main></body></html>`;

export function blockedResponse(): Response {
  return new Response(PAGE, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "Retry-After": "3600",
      "X-Robots-Tag": "noindex",
    },
  });
}

/** Returns a block Response for blocked-city traffic, or null to continue. Never throws. */
export async function checkGeoBlock(request: Request): Promise<Response | null> {
  let path = "/";
  try {
    const url = new URL(request.url);
    path = url.pathname;
    if (!shouldCheck(request, path)) return null;

    const t = getRequestTelemetry(request);
    const { resolveApproximateGeo } = await import("./ip-geo.server");
    const geo: ApproximateGeo = await resolveApproximateGeo(t);
    const rule = matchBlockedCity(geo);
    if (!rule) return null;

    // Log BEFORE returning the block. Each retry is its own row.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("blocked_visits").insert({
        ip_address: t.ipAddress,
        city: geo.city,
        region: geo.region,
        country: geo.country,
        postal_code: geo.postalCode,
        geo_source: geo.geoSource,
        geo_provider: geo.provider,
        path: (path + url.search).slice(0, 500),
        referrer: request.headers.get("referer")?.slice(0, 500) ?? null,
        user_agent: t.userAgent || null,
        blocked: true,
        block_reason: blockReasonFor(rule),
        action: BLOCK_ACTION,
      });
    } catch (e) {
      console.error("[geo-block] log failed", e);
    }
    return blockedResponse();
  } catch (e) {
    console.error("[geo-block] check failed", e);
    return null;
  }
}
