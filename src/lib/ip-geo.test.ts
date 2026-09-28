import { describe, expect, it } from "vitest";
import { classifyNetwork, deriveReliability, explicitBool } from "./ip-geo.server";

const none = {
  isMobile: null,
  isVpn: null,
  isProxy: null,
  isTor: null,
  isHosting: null,
  isRelay: null,
};

describe("explicitBool", () => {
  it("only accepts real booleans", () => {
    expect(explicitBool(true)).toBe(true);
    expect(explicitBool(false)).toBe(false);
    expect(explicitBool(undefined)).toBeNull();
    expect(explicitBool(null)).toBeNull();
    expect(explicitBool("true")).toBeNull();
    expect(explicitBool(0)).toBeNull();
  });
});

describe("classifyNetwork", () => {
  it("is unknown when the provider supplied no flags", () => {
    expect(classifyNetwork(none)).toBe("unknown");
  });

  it("never labels mobile/vpn without an explicit signal", () => {
    expect(classifyNetwork({ ...none, isMobile: null })).toBe("unknown");
    expect(classifyNetwork({ ...none, isMobile: true })).toBe("mobile");
    expect(classifyNetwork({ ...none, isVpn: true })).toBe("vpn");
  });

  it("prefers the most severe explicit signal", () => {
    expect(classifyNetwork({ ...none, isTor: true, isVpn: true, isMobile: true })).toBe("tor");
    expect(classifyNetwork({ ...none, isHosting: true, isMobile: true })).toBe("hosting");
  });

  it("is standard only when the provider answered and all answers were false", () => {
    expect(classifyNetwork({ ...none, isVpn: false })).toBe("standard");
    expect(classifyNetwork({ ...none, isVpn: false, isTor: true })).toBe("tor");
  });
});

describe("deriveReliability", () => {
  it("is low for any explicit low-reliability signal", () => {
    expect(deriveReliability(true, { ...none, isMobile: true })).toBe("low");
    expect(deriveReliability(false, { ...none, isRelay: true })).toBe("low");
  });

  it("is medium for a usable place with no low signal", () => {
    expect(deriveReliability(true, none)).toBe("medium");
    expect(deriveReliability(true, { ...none, isVpn: false })).toBe("medium");
  });

  it("is unknown without a usable place", () => {
    expect(deriveReliability(false, none)).toBe("unknown");
  });
});

import { mergeLookups, parseAsn, parseIpApi, type LookupResult } from "./ip-geo.server";

const base = (o: Partial<LookupResult>): LookupResult => ({
  country: null, region: null, city: null, postal_code: null, lookup_ok: true,
  provider: "ipwhois", asn: null, as_organization: null, isp: null,
  is_mobile: null, is_vpn: null, is_proxy: null, is_tor: null, is_hosting: null, is_relay: null,
  ...o,
});

describe("parseAsn", () => {
  it("parses AS-prefixed and numeric values only", () => {
    expect(parseAsn("AS15169")).toBe(15169);
    expect(parseAsn("15169")).toBe(15169);
    expect(parseAsn(701)).toBe(701);
    expect(parseAsn("Google")).toBeNull();
    expect(parseAsn(undefined)).toBeNull();
  });
});

describe("parseIpApi", () => {
  it("reads coarse fields, ignores lat/long, infers no flags", () => {
    const r = parseIpApi({
      country_code: "US", region: "New Jersey", city: "Bayonne", postal: "07002",
      asn: "AS701", org: "Verizon Business Hosting VPN", latitude: 40.6, longitude: -74.1,
    })!;
    expect(r.provider).toBe("ipapi");
    expect(r.city).toBe("Bayonne");
    expect(r.asn).toBe(701);
    expect(r.as_organization).toBe("Verizon Business Hosting VPN");
    expect(r.is_vpn).toBeNull();
    expect(r.is_hosting).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/latitude|longitude|40\.6/);
  });
  it("returns null on an error body", () => {
    expect(parseIpApi({ error: true, reason: "RateLimited" })).toBeNull();
  });
});

describe("mergeLookups", () => {
  it("returns null when no provider succeeded", () => {
    expect(mergeLookups([null, undefined])).toBeNull();
  });
  it("prefers the provider with a usable city/region and keeps ASN/org from another", () => {
    const whois = base({ country: "US", asn: 701, as_organization: "Verizon", is_vpn: false });
    const ipapi = base({ provider: "ipapi", country: "US", region: "New Jersey", city: "Bayonne" });
    const m = mergeLookups([whois, null, ipapi])!;
    expect(m.provider).toBe("ipapi");
    expect(m.city).toBe("Bayonne");
    expect(m.asn).toBe(701);
    expect(m.as_organization).toBe("Verizon");
    expect(m.is_vpn).toBe(false);
  });
  it("never overwrites a known value with null or another value", () => {
    const a = base({ city: "Hackensack", region: "New Jersey", asn: 1, isp: "X" });
    const b = base({ provider: "ipapi", city: "Other", asn: null, isp: "Y" });
    const m = mergeLookups([a, b])!;
    expect(m.city).toBe("Hackensack");
    expect(m.asn).toBe(1);
    expect(m.isp).toBe("X");
  });
  it("falls back to the first result when no provider has a place", () => {
    const m = mergeLookups([base({ country: "US" }), base({ provider: "ipapi", asn: 5 })])!;
    expect(m.provider).toBe("ipwhois");
    expect(m.asn).toBe(5);
  });
});

import { afterEach, beforeEach, vi } from "vitest";
import { resolveApproximateGeo } from "./ip-geo.server";

const mockState = vi.hoisted(() => ({
  cacheRow: null as any,
  upserts: [] as any[],
}));

vi.mock("@/integrations/supabase/ext.server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mockState.cacheRow, error: null }) }),
      }),
      upsert: async (row: any) => {
        mockState.upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

describe("resolveApproximateGeo purpose separation", () => {
  const telemetry = {
    ipAddress: "8.8.8.8",
    country: "US",
    region: null,
    city: null,
    postalCode: null,
    userAgent: "test",
  } as any;

  let calls: string[];
  beforeEach(() => {
    calls = [];
    mockState.cacheRow = null;
    mockState.upserts = [];
    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      calls.push(String(url));
      // ipwho.is and MaxMind fail; ipapi.co would succeed if called.
      if (String(url).includes("ipapi.co")) {
        return new Response(
          JSON.stringify({ country_code: "US", region: "New Jersey", city: "Bayonne" }),
          { status: 200 },
        );
      }
      return new Response("fail", { status: 500 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("blocking purpose never calls ipapi.co", async () => {
    const geo = await resolveApproximateGeo(telemetry, "blocking");
    expect(calls.some((u) => u.includes("ipapi.co"))).toBe(false);
    expect(geo.city).toBeNull();
  });

  it("analytics purpose may use the ipapi.co fallback", async () => {
    const geo = await resolveApproximateGeo(telemetry, "analytics");
    expect(calls.some((u) => u.includes("ipapi.co"))).toBe(true);
    expect(geo.city).toBe("Bayonne");
  });
});

describe("resolveApproximateGeo blocking cache independence", () => {
  const telemetry = {
    ipAddress: "8.8.8.8",
    country: "US",
    region: null,
    city: null,
    postalCode: null,
    userAgent: "test",
  } as any;

  const ipapiCacheRow = {
    ip_address: "8.8.8.8",
    country: "US",
    region: "New Jersey",
    city: "Bayonne",
    postal_code: "07002",
    lookup_ok: true,
    provider: "ipapi",
    fetched_at: new Date().toISOString(),
  };

  let calls: string[];
  beforeEach(() => {
    calls = [];
    mockState.cacheRow = null;
    mockState.upserts = [];
    vi.stubGlobal("fetch", vi.fn(async (url: any) => {
      calls.push(String(url));
      if (String(url).includes("ipapi.co")) {
        return new Response(
          JSON.stringify({ country_code: "US", region: "New Jersey", city: "Bayonne" }),
          { status: 200 },
        );
      }
      return new Response("fail", { status: 500 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("blocking ignores a cached ipapi row and re-runs the original chain", async () => {
    mockState.cacheRow = ipapiCacheRow;
    const geo = await resolveApproximateGeo(telemetry, "blocking");
    expect(geo.city).toBeNull();
    expect(calls.some((u) => u.includes("ipwho.is"))).toBe(true);
    expect(calls.some((u) => u.includes("ipapi.co"))).toBe(false);
  });

  it("blocking never writes to the cache, preserving the analytics row", async () => {
    mockState.cacheRow = ipapiCacheRow;
    await resolveApproximateGeo(telemetry, "blocking");
    expect(mockState.upserts).toHaveLength(0);
  });

  it("analytics still consumes the cached ipapi row without new lookups", async () => {
    mockState.cacheRow = ipapiCacheRow;
    const geo = await resolveApproximateGeo(telemetry, "analytics");
    expect(geo.city).toBe("Bayonne");
    expect(geo.provider).toBe("ipapi");
    expect(calls).toHaveLength(0);
  });
});
