// Server-only approximate geolocation resolution for first-party analytics.
//
// Precedence:
//   1. "edge"         — native hosting/Cloudflare geo headers (preferred, free, instant)
//   2. "ip_lookup"    — ipwho.is HTTPS lookup, then MaxMind GeoLite City, then
//                       ipapi.co, then ip-api.com (analytics-only final fallback;
//                       each fallback only when no usable city/region so far)
//   3. "country_only" — lookup unavailable/failed; existing country (if any) is kept
//
// The visitor IP never leaves the server: it is used as the lookup argument and
// as the cache key only, and is never returned to the browser.
//
// Cache: public.ip_geo_cache in the analytics (external) Supabase project.
// Successful lookups are reused for 7 days; failures are re-tried after 10 minutes.
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
export type GeoProvider = "edge" | "ipwhois" | "maxmind" | "ipapi" | "ipapicom" | "none";
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
const FAILURE_TTL_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 4000;

type ProviderName = "ipwhois" | "maxmind" | "ipapi" | "ipapicom";

/**
 * Server-only diagnostic for a provider failure. Logs provider + failure kind
 * (timeout / network / http status / bad body) only — never the IP address.
 */
export function logProviderFailure(provider: ProviderName, kind: "timeout" | "network" | "http" | "unsuccessful", status?: number) {
  console.warn(`[ip-geo] provider=${provider} failure=${kind}${status !== undefined ? ` status=${status}` : ""}`);
}

async function providerFetch(provider: ProviderName, url: string, init: RequestInit = {}): Promise<Record<string, any> | null> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    logProviderFailure(provider, name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
    return null;
  }
  if (!res.ok) {
    logProviderFailure(provider, "http", res.status);
    return null;
  }
  try {
    return (await res.json()) as Record<string, any>;
  } catch {
    logProviderFailure(provider, "unsuccessful");
    return null;
  }
}

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

export type LookupResult = {
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
    const j = await providerFetch("maxmind", `https://geolite.info/geoip/v2.1/city/${encodeURIComponent(ip)}`, {
      headers: {
        Authorization: `Basic ${btoa(`${accountId}:${licenseKey}`)}`,
        Accept: "application/json",
      },
    });
    if (!j) return null;
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
    const j = await providerFetch(
      "ipwhois",
      `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city,postal,connection,security`,
    );
    if (!j) return null;
    if (j["success"] !== true) {
      logProviderFailure("ipwhois", "unsuccessful");
      return null;
    }
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

/** Parse "AS15169" / "15169" / 15169 into a number; anything else -> null. */
export function parseAsn(v: unknown): number | null {
  if (typeof v === "number") return num(v);
  if (typeof v !== "string") return null;
  const m = /^\s*(?:AS)?(\d{1,10})\s*$/i.exec(v);
  return m ? Number(m[1]) : null;
}

/** Map an ipapi.co JSON body to a LookupResult. Exported for tests. */
export function parseIpApi(j: Record<string, unknown>): LookupResult | null {
  if (!j || j["error"] === true) return null;
  return {
    country: clean(j["country_code"], 10),
    region: clean(j["region"], 120),
    city: clean(j["city"], 120),
    postal_code: clean(j["postal"], 20),
    lookup_ok: true,
    provider: "ipapi",
    asn: parseAsn(j["asn"]),
    as_organization: clean(j["org"], 200),
    isp: null,
    // ipapi.co does not return explicit risk booleans; never infer them from org names.
    is_mobile: null,
    is_vpn: null,
    is_proxy: null,
    is_tor: null,
    is_hosting: null,
    is_relay: null,
  };
}

// ipapi.co JSON API (HTTPS, server-side only). Coarse fields only; lat/long ignored.
async function lookupIpApi(ip: string): Promise<LookupResult | null> {
  try {
    const key = process.env["IPAPI_KEY"];
    const url = `https://ipapi.co/${encodeURIComponent(ip)}/json/${key ? `?key=${encodeURIComponent(key)}` : ""}`;
    const j = await providerFetch("ipapi", url, {
      headers: { Accept: "application/json", "User-Agent": "torahforthetable-analytics" },
    });
    if (!j) return null;
    const parsed = parseIpApi(j);
    if (!parsed) logProviderFailure("ipapi", "unsuccessful");
    return parsed;
  } catch {
    return null;
  }
}

/** Parse an ip-api.com JSON body to a LookupResult. Exported for tests. */
export function parseIpApiCom(j: Record<string, unknown>): LookupResult | null {
  if (!j || j["status"] !== "success") return null;
  // The "as" field looks like "AS15169 Google LLC"; org/isp are separate fields.
  const asField = clean(j["as"], 200);
  const asn = asField ? parseAsn(asField.split(" ")[0]) : null;
  return {
    country: clean(j["countryCode"], 10),
    region: clean(j["regionName"], 120),
    city: clean(j["city"], 120),
    postal_code: clean(j["zip"], 20),
    lookup_ok: true,
    provider: "ipapicom",
    asn,
    as_organization: clean(j["org"], 200),
    isp: clean(j["isp"], 200),
    // ip-api.com returns explicit booleans for these; tor/relay are not offered.
    is_mobile: explicitBool(j["mobile"]),
    is_vpn: null,
    is_proxy: explicitBool(j["proxy"]),
    is_tor: null,
    is_hosting: explicitBool(j["hosting"]),
    is_relay: null,
  };
}

// ip-api.com JSON API (server-side only; free tier is HTTP-only, which is fine
// for a server-to-server coarse lookup). Coarse fields only; lat/long ignored.
async function lookupIpApiCom(ip: string): Promise<LookupResult | null> {
  try {
    const j = await providerFetch(
      "ipapicom",
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,regionName,city,zip,as,org,isp,mobile,proxy,hosting`,
      { headers: { Accept: "application/json" } },
    );
    if (!j) return null;
    const parsed = parseIpApiCom(j);
    if (!parsed) logProviderFailure("ipapicom", "unsuccessful");
    return parsed;
  } catch {
    return null;
  }
}

const FLAG_KEYS = ["is_mobile", "is_vpn", "is_proxy", "is_tor", "is_hosting", "is_relay"] as const;

/**
 * Conservative merge of provider results (in priority order).
 * Location comes from the first provider with a usable city/region (else the
 * first result). Other fields are filled from later providers only where the
 * selected one is null — a known value is never overwritten with null.
 */
export function mergeLookups(results: (LookupResult | null | undefined)[]): LookupResult | null {
  const list = results.filter((r): r is LookupResult => !!r && r.lookup_ok);
  if (list.length === 0) return null;
  const primary = list.find((r) => isUsable(r)) ?? list[0];
  const out: LookupResult = { ...primary };
  for (const r of list) {
    if (r === primary) continue;
    // Location fields only from the same provider as the city/region, except country.
    if (out.country == null && r.country != null) out.country = r.country;
    if (out.asn == null && r.asn != null) out.asn = r.asn;
    if (out.as_organization == null && r.as_organization != null)
      out.as_organization = r.as_organization;
    if (out.isp == null && r.isp != null) out.isp = r.isp;
    for (const k of FLAG_KEYS) if (out[k] == null && r[k] != null) out[k] = r[k];
  }
  return out;
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
 *
 * purpose "blocking" (used by the geo-block gate) preserves the original
 * provider chain — edge -> ipwho.is -> MaxMind — and never calls ipapi.co,
 * so blocked-city enforcement is unaffected by the analytics-only fallback.
 */
export async function resolveApproximateGeo(
  t: RequestTelemetry,
  purpose: "analytics" | "blocking" = "analytics",
): Promise<ApproximateGeo> {
  const edgeFlags: NetworkFlags = { ...EMPTY_FLAGS };
  const countryOnly = () =>
    finalize({
      country: t.country,
      region: t.region,
      city: t.city,
      postalCode: t.postalCode,
      geoSource: "geo_pending",
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

  // Blocking uses its own persistent cache (Lovable Cloud geo_block_cache),
  // filled only by the blocking chain (ipwho.is -> MaxMind). It never reads or
  // writes the analytics ip_geo_cache, so analytics-only providers can never
  // influence an access-control decision.
  if (purpose === "blocking") return resolveForBlocking(t, ip, countryOnly);

  try {
    const { getSupabaseAdmin } = await import("@/integrations/supabase/ext.server");
    const supabase = getSupabaseAdmin();

    const cached = await readCache(supabase, ip);
    // Analytics reuses any fresh cache row so providers aren't re-queried per page/event.
    if (cached) {
      if (!cached.lookup_ok) return countryOnly();
      const provider: GeoProvider =
        cached.provider === "ipwhois" || cached.provider === "maxmind" ||
        cached.provider === "ipapi" || cached.provider === "ipapicom"
          ? cached.provider
          : "none";
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

    // Analytics: ipwho.is and MaxMind run concurrently (merge order unchanged:
    // ipwho.is first), and ipapi.co only when neither yields a usable city/region.
    // Blocking keeps the original serial chain ipwho.is -> MaxMind, no ipapi.co.
    const results: LookupResult[] = [];
    if (purpose === "analytics") {
      const [whois, mm] = await Promise.all([lookupIpWhoIs(ip), lookupMaxMind(ip)]);
      if (whois) results.push(whois);
      if (mm) results.push(mm);
      if (!isUsable(whois) && !isUsable(mm)) {
        const ipapi = await lookupIpApi(ip);
        if (ipapi) results.push(ipapi);
        // Final analytics-only fallback: ip-api.com, only when ipapi.co also
        // failed to yield a usable city/region.
        if (!isUsable(ipapi)) {
          const ipapicom = await lookupIpApiCom(ip);
          if (ipapicom) results.push(ipapicom);
        }
      }
    } else {
      const whois = await lookupIpWhoIs(ip);
      if (whois) results.push(whois);
      if (!isUsable(whois)) {
        const mm = await lookupMaxMind(ip);
        if (mm) results.push(mm);
      }
    }
    let fresh = mergeLookups(results);

    // A single transient provider/network failure should not strand a visitor at
    // country_only. For analytics only, retry the two zero-config HTTPS providers
    // once, in parallel, after a short pause. This retry runs only when the entire
    // first provider chain produced no usable result, so normal requests are not
    // slowed down or doubled.
    if (!fresh && purpose === "analytics") {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const retryResults = await Promise.all([lookupIpWhoIs(ip), lookupIpApi(ip), lookupIpApiCom(ip)]);
      fresh = mergeLookups(retryResults);
    }

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

// ---------------------------------------------------------------------------
// Blocking-only geo resolution with its own persistent cache.
// ---------------------------------------------------------------------------

const BLOCK_SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BLOCK_FAILURE_TTL_MS = 10 * 60 * 1000;
const BLOCK_PROVIDERS = new Set(["ipwhois", "maxmind"]);

async function resolveForBlocking(
  t: RequestTelemetry,
  ip: string,
  countryOnly: () => ApproximateGeo,
): Promise<ApproximateGeo> {
  const fromRow = (r: {
    country: string | null;
    region: string | null;
    city: string | null;
    postal_code: string | null;
    provider: string | null;
  }) =>
    finalize({
      country: r.country ?? t.country,
      region: r.region,
      city: r.city,
      postalCode: r.postal_code,
      geoSource: "ip_lookup",
      provider: (r.provider === "maxmind" ? "maxmind" : "ipwhois") as GeoProvider,
      asn: t.asn ?? null,
      asOrganization: t.asOrganization ?? null,
      isp: null,
      flags: { ...EMPTY_FLAGS },
    });

  let admin: any = null;
  try {
    ({ supabaseAdmin: admin } = await import("@/integrations/supabase/client.server"));
    const { data } = await admin
      .from("geo_block_cache")
      .select("*")
      .eq("ip_address", ip)
      .maybeSingle();
    if (data) {
      const age = Date.now() - Date.parse(data.fetched_at);
      const ttl = data.lookup_ok ? BLOCK_SUCCESS_TTL_MS : BLOCK_FAILURE_TTL_MS;
      if (Number.isFinite(age) && age <= ttl) {
        if (!data.lookup_ok || !BLOCK_PROVIDERS.has(data.provider)) return countryOnly();
        return fromRow(data);
      }
    }
  } catch {
    /* cache is best-effort; fall through to providers */
  }

  try {
    const results: LookupResult[] = [];
    const whois = await lookupIpWhoIs(ip);
    if (whois) results.push(whois);
    if (!isUsable(whois)) {
      const mm = await lookupMaxMind(ip);
      if (mm) results.push(mm);
    }
    const fresh = mergeLookups(results);
    const ok = !!fresh && BLOCK_PROVIDERS.has(fresh.provider);
    if (admin) {
      try {
        await admin.from("geo_block_cache").upsert(
          {
            ip_address: ip,
            country: ok ? fresh!.country : t.country,
            region: ok ? fresh!.region : null,
            city: ok ? fresh!.city : null,
            postal_code: ok ? fresh!.postal_code : null,
            provider: ok ? fresh!.provider : "none",
            lookup_ok: ok,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "ip_address" },
        );
      } catch {
        /* best-effort */
      }
    }
    return ok ? fromRow(fresh!) : countryOnly();
  } catch {
    return countryOnly(); // fail open
  }
}
