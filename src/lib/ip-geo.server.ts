// Server-only approximate geolocation resolution for first-party analytics.
//
// Precedence:
//   1. "edge"         — native hosting/Cloudflare geo headers (preferred, free, instant)
//   2. "ip_lookup"    — ipwho.is HTTPS lookup, only when native city/region is missing
//   3. "country_only" — lookup unavailable/failed; existing country (if any) is kept
//
// The visitor IP never leaves the server: it is used as the lookup argument and
// as the cache key only, and is never returned to the browser.
//
// Cache: public.ip_geo_cache in the analytics (external) Supabase project.
// Successful lookups are reused for 7 days; failures are re-tried after 6 hours.
// That means one external request per uncached IP — never one per event.

import type { RequestTelemetry } from "./request-telemetry.server";

export type GeoSource = "edge" | "ip_lookup" | "country_only";

export type ApproximateGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  geoSource: GeoSource;
};

const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 1500;

function clean(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

type CacheRow = {
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  lookup_ok: boolean;
  fetched_at: string;
};

async function readCache(supabase: any, ip: string): Promise<CacheRow | null> {
  try {
    const { data, error } = await supabase
      .from("ip_geo_cache")
      .select("country,region,city,postal_code,lookup_ok,fetched_at")
      .eq("ip_address", ip)
      .maybeSingle();
    if (error || !data) return null;
    const age = Date.now() - Date.parse(data.fetched_at);
    const ttl = data.lookup_ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    if (!Number.isFinite(age) || age > ttl) return null;
    return data as CacheRow;
  } catch {
    return null;
  }
}

async function writeCache(supabase: any, ip: string, row: Omit<CacheRow, "fetched_at">) {
  try {
    await supabase
      .from("ip_geo_cache")
      .upsert({ ip_address: ip, ...row, fetched_at: new Date().toISOString() }, { onConflict: "ip_address" });
  } catch {
    /* cache is best-effort */
  }
}

async function lookupIpWhoIs(ip: string): Promise<Omit<CacheRow, "fetched_at"> | null> {
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city,postal`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (j["success"] !== true) return null;
    return {
      country: clean(j["country_code"], 10),
      region: clean(j["region"], 120),
      city: clean(j["city"], 120),
      postal_code: clean(j["postal"], 20),
      lookup_ok: true,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve approximate country/region/city/postal for one request. Call at most
 * once per incoming request (never per event). Latitude/longitude is never
 * requested or stored.
 */
export async function resolveApproximateGeo(t: RequestTelemetry): Promise<ApproximateGeo> {
  const base: ApproximateGeo = {
    country: t.country,
    region: t.region,
    city: t.city,
    postalCode: t.postalCode,
    geoSource: "country_only",
  };

  // Native edge geo wins whenever the hosting layer actually provides it.
  if (t.city || t.region) return { ...base, geoSource: "edge" };

  const ip = t.ipAddress;
  if (!ip || isPrivateIp(ip)) return base;

  try {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
    const supabase = getSupabaseAdmin();

    const cached = await readCache(supabase, ip);
    if (cached) {
      if (!cached.lookup_ok) return base;
      return {
        country: cached.country ?? t.country,
        region: cached.region,
        city: cached.city,
        postalCode: cached.postal_code,
        geoSource: "ip_lookup",
      };
    }

    const fresh = await lookupIpWhoIs(ip);
    if (!fresh) {
      await writeCache(supabase, ip, {
        country: t.country,
        region: null,
        city: null,
        postal_code: null,
        lookup_ok: false,
      });
      return base;
    }

    await writeCache(supabase, ip, fresh);
    return {
      country: fresh.country ?? t.country,
      region: fresh.region,
      city: fresh.city,
      postalCode: fresh.postal_code,
      geoSource: "ip_lookup",
    };
  } catch {
    return base;
  }
}
