// Server-only approximate geolocation resolution for first-party analytics.
//
// Precedence:
//   1. "edge"         — native hosting/Cloudflare geo headers (preferred, free, instant)
//   2. "ip_lookup"    — ipwho.is HTTPS lookup, then MaxMind GeoLite City fallback
//   3. "country_only" — lookup unavailable/failed; existing country (if any) is kept
//
// The visitor IP never leaves the server: it is used as the lookup argument and
// as the cache key only, and is never returned to the browser.
//
// Cache: public.ip_geo_cache in the analytics (external) Supabase project.
// Successful lookups are reused for 7 days; failures are re-tried after 6 hours.
// That means one external request per uncached IP — never one per event.
//
// Network metadata rules:
//   * Only values the provider actually supplied are stored. Missing signals
//     stay NULL (unknown) and are NEVER downgraded to false.
//   * A network is only labelled mobile/VPN/proxy/Tor/hosting/relay when the
//     provider returned an explicit boolean for it.
//   * Reliability is a statement about whether the city/ZIP plausibly reflects
//     the visitor's physical area — never "high" from IP geolocation alone.

import type { RequestTelemetry } from "./request-telemetry.server";

export type GeoSource = "edge" | "ip_lookup" | "country_only";
export type GeoProvider = "edge" | "ipwhois" | "maxmind" | "none";
export type GeoReliability = "low" | "medium" | "unknown";
export type NetworkType =
  | "mobile"
  | "vpn"
  | "proxy"
  | "tor"
  | "hosting"
  | "relay"
  | "standard"
  | "unknown";

export type NetworkFlags = {
  isMobile: boolean | null;
  isVpn: boolean | null;
  isProxy: boolean | null;
  isTor: boolean | null;
  isHosting: boolean | null;
  isRelay: boolean | null;
};

export type ApproximateGeo = {
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  geoSource: GeoSource;
  provider: GeoProvider;
  reliability: GeoReliability;
  networkType: NetworkType;
  asn: number | null;
  asOrganization: string | null;
  isp: string | null;
} & NetworkFlags;

const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 1500;

function clean(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Only an explicit boolean counts. Anything else stays unknown (null). */
export function explicitBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
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

const EMPTY_FLAGS: NetworkFlags = {
  isMobile: null,
  isVpn: null,
  isProxy: null,
  isTor: null,
  isHosting: null,
  isRelay: null,
};

type LookupResult = {
  country: string | null;
  region: string | null;
  city: string | null;
  postal_code: string | null;
  lookup_ok: boolean;
  provider: GeoProvider;
  asn: number | null;
  as_organization: string | null;
  isp: string | null;
  is_mobile: boolean | null;
  is_vpn: boolean | null;
  is_proxy: boolean | null;
  is_tor: boolean | null;
  is_hosting: boolean | null;
  is_relay: boolean | null;
};

type CacheRow = LookupResult & { fetched_at: string };

/** Network classification from explicit provider signals only. */
export function classifyNetwork(flags: NetworkFlags): NetworkType {
  if (flags.isTor === true) return "tor";
  if (flags.isVpn === true) return "vpn";
  if (flags.isProxy === true) return "proxy";
  if (flags.isRelay === true) return "relay";
  if (flags.isHosting === true) return "hosting";
  if (flags.isMobile === true) return "mobile";
  const values = Object.values(flags);
  // "standard" only when the provider explicitly answered at least one flag
  // and every answer it gave was false.
  if (values.some((v) => v === false) && !values.some((v) => v === true)) return "standard";
  return "unknown";
}

/** Confidence that the city/ZIP reflects the visitor's physical area. */
export function deriveReliability(
  hasUsablePlace: boolean,
  flags: NetworkFlags,
): GeoReliability {
  if (Object.values(flags).some((v) => v === true)) return "low";
  if (hasUsablePlace) return "medium";
  return "unknown";
}

function flagsOf(r: {
  is_mobile?: boolean | null;
  is_vpn?: boolean | null;
  is_proxy?: boolean | null;
  is_tor?: boolean | null;
  is_hosting?: boolean | null;
  is_relay?: boolean | null;
}): NetworkFlags {
  return {
    isMobile: explicitBool(r.is_mobile),
    isVpn: explicitBool(r.is_vpn),
    isProxy: explicitBool(r.is_proxy),
    isTor: explicitBool(r.is_tor),
    isHosting: explicitBool(r.is_hosting),
    isRelay: explicitBool(r.is_relay),
  };
}

async function readCache(supabase: any, ip: string): Promise<Partial<CacheRow> | null> {
  try {
    // select("*") tolerates caches created before the network-metadata columns.
    const { data, error } = await supabase
      .from("ip_geo_cache")
      .select("*")
      .eq("ip_address", ip)
      .maybeSingle();
    if (error || !data) return null;
    const age = Date.now() - Date.parse(data.fetched_at);
    const ttl = data.lookup_ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
    if (!Number.isFinite(age) || age > ttl) return null;
    return data as Partial<CacheRow>;
  } catch {
    return null;
  }
}

const LEGACY_CACHE_KEYS = ["country", "region", "city", "postal_code", "lookup_ok"] as const;

async function writeCache(supabase: any, ip: string, row: LookupResult) {
  const full = { ip_address: ip, ...row, fetched_at: new Date().toISOString() };
  try {
    const { error } = await supabase
      .from("ip_geo_cache")
      .upsert(full, { onConflict: "ip_address" });
    if (!error) return;
    // The extended metadata columns may not exist yet — keep the base cache working.
    const legacy: Record<string, unknown> = {
      ip_address: ip,
      fetched_at: full.fetched_at,
    };
    for (const key of LEGACY_CACHE_KEYS) legacy[key] = (row as Record<string, unknown>)[key];
    await supabase.from("ip_geo_cache").upsert(legacy, { onConflict: "ip_address" });
  } catch {
    /* cache is best-effort */
  }
}

function isUsable(r: { city: string | null; region: string | null } | null): boolean {
  return !!r && (!!r.city || !!r.region);
}

// MaxMind GeoLite City web service (HTTPS, Basic auth). Server-only.
// Only country / region / city / postal / ASN traits are read — never lat/long.
// GeoLite City does NOT classify mobile/VPN/proxy/Tor, so those stay null.
async function lookupMaxMind(ip: string): Promise<LookupResult | null> {
  const accountId = process.env["MAXMIND_ACCOUNT_ID"];
  const licenseKey = process.env["MAXMIND_LICENSE_KEY"];
  if (!accountId || !licenseKey) return null;
  try {
    const res = await fetch(`https://geolite.info/geoip/v2.1/city/${encodeURIComponent(ip)}`, {
      headers: {
        Authorization: `Basic ${btoa(`${accountId}:${licenseKey}`)}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, any>;
    const sub = Array.isArray(j["subdivisions"]) ? j["subdivisions"][0] : null;
    const traits = (j["traits"] ?? {}) as Record<string, unknown>;
    return {
      country: clean(j["country"]?.["iso_code"], 10),
      region: clean(sub?.["names"]?.["en"] ?? sub?.["iso_code"], 120),
      city: clean(j["city"]?.["names"]?.["en"], 120),
      postal_code: clean(j["postal"]?.["code"], 20),
      lookup_ok: true,
      provider: "maxmind",
      asn: num(traits["autonomous_system_number"]),
      as_organization: clean(traits["autonomous_system_organization"], 200),
      isp: clean(traits["isp"], 200),
      is_mobile: null,
      is_vpn: null,
      is_proxy: null,
      is_tor: null,
      is_hosting: null,
      is_relay: null,
    };
  } catch {
    return null;
  }
}

async function lookupIpWhoIs(ip: string): Promise<LookupResult | null> {
  try {
    const res = await fetch(
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city,postal,connection,security`,
      { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, any>;
    if (j["success"] !== true) return null;
    // connection/security are only present on some plans; absent -> unknown.
    const conn = (j["connection"] ?? {}) as Record<string, unknown>;
    const sec = (j["security"] ?? {}) as Record<string, unknown>;
    return {
      country: clean(j["country_code"], 10),
      region: clean(j["region"], 120),
      city: clean(j["city"], 120),
      postal_code: clean(j["postal"], 20),
      lookup_ok: true,
      provider: "ipwhois",
      asn: num(conn["asn"]),
      as_organization: clean(conn["org"], 200),
      isp: clean(conn["isp"], 200),
      is_mobile: explicitBool(sec["mobile"]),
      is_vpn: explicitBool(sec["vpn"]),
      is_proxy: explicitBool(sec["proxy"]),
      is_tor: explicitBool(sec["tor"]),
      is_hosting: explicitBool(sec["hosting"]),
      is_relay: explicitBool(sec["relay"]),
    };
  } catch {
    return null;
  }
}

function finalize(args: {
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  geoSource: GeoSource;
  provider: GeoProvider;
  asn: number | null;
  asOrganization: string | null;
  isp: string | null;
  flags: NetworkFlags;
}): ApproximateGeo {
  const hasPlace = !!(args.city || args.region);
  return {
    country: args.country,
    region: args.region,
    city: args.city,
    postalCode: args.postalCode,
    geoSource: args.geoSource,
    provider: args.provider,
    reliability: deriveReliability(hasPlace, args.flags),
    networkType: classifyNetwork(args.flags),
    asn: args.asn,
    asOrganization: args.asOrganization,
    isp: args.isp,
    ...args.flags,
  };
}

/**
 * Resolve approximate country/region/city/postal plus provider/network metadata
 * for one request. Call at most once per incoming request (never per event).
 * Latitude/longitude is never requested or stored.
 */
export async function resolveApproximateGeo(t: RequestTelemetry): Promise<ApproximateGeo> {
  const edgeFlags: NetworkFlags = { ...EMPTY_FLAGS };
  const countryOnly = () =>
    finalize({
      country: t.country,
      region: t.region,
      city: t.city,
      postalCode: t.postalCode,
      geoSource: "country_only",
      provider: "none",
      asn: t.asn ?? null,
      asOrganization: t.asOrganization ?? null,
      isp: null,
      flags: edgeFlags,
    });

  // Native edge geo wins whenever the hosting layer actually provides it.
  if (t.city || t.region) {
    return finalize({
      country: t.country,
      region: t.region,
      city: t.city,
      postalCode: t.postalCode,
      geoSource: "edge",
      provider: "edge",
      asn: t.asn ?? null,
      asOrganization: t.asOrganization ?? null,
      isp: null,
      flags: edgeFlags,
    });
  }

  const ip = t.ipAddress;
  if (!ip || isPrivateIp(ip)) return countryOnly();

  try {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
    const supabase = getSupabaseAdmin();

    const cached = await readCache(supabase, ip);
    if (cached) {
      if (!cached.lookup_ok) return countryOnly();
      const provider: GeoProvider =
        cached.provider === "ipwhois" || cached.provider === "maxmind" ? cached.provider : "none";
      return finalize({
        country: cached.country ?? t.country,
        region: cached.region ?? null,
        city: cached.city ?? null,
        postalCode: cached.postal_code ?? null,
        geoSource: "ip_lookup",
        provider,
        asn: cached.asn ?? t.asn ?? null,
        asOrganization: cached.as_organization ?? t.asOrganization ?? null,
        isp: cached.isp ?? null,
        flags: flagsOf(cached),
      });
    }

    const whois = await lookupIpWhoIs(ip);
    // MaxMind GeoLite City is only called when ipwho.is failed or gave no city/region.
    const fresh = isUsable(whois) ? whois : ((await lookupMaxMind(ip)) ?? whois);
    if (!fresh) {
      await writeCache(supabase, ip, {
        country: t.country,
        region: null,
        city: null,
        postal_code: null,
        lookup_ok: false,
        provider: "none",
        asn: null,
        as_organization: null,
        isp: null,
        is_mobile: null,
        is_vpn: null,
        is_proxy: null,
        is_tor: null,
        is_hosting: null,
        is_relay: null,
      });
      return countryOnly();
    }

    await writeCache(supabase, ip, fresh);
    return finalize({
      country: fresh.country ?? t.country,
      region: fresh.region,
      city: fresh.city,
      postalCode: fresh.postal_code,
      geoSource: "ip_lookup",
      provider: fresh.provider,
      asn: fresh.asn ?? t.asn ?? null,
      asOrganization: fresh.as_organization ?? t.asOrganization ?? null,
      isp: fresh.isp,
      flags: flagsOf(fresh),
    });
  } catch {
    return countryOnly();
  }
}
