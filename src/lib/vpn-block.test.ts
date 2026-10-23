import { describe, expect, it } from "vitest";
import { parseProxycheckResponse, shouldDenyPrivacy, shouldBlockPrivacy, isIcloudPrivateRelayException, isTemporaryBrooklynVpnException, privacyRestrictedResponse, classifyProxycheckDenial, chooseProxycheckKey, getWorkerProxycheckBinding, readProxycheckKey, proxycheckKeyShape } from "./vpn-block.server";

const reply = (ip: string, detections: object, overrides: object = {}) => ({
  status: "ok", [ip]: {
    detections, network: { type: "Hosting" },
    location: { city_name: "New York", region_name: "New York", country_code: "US" },
    ...overrides,
  },
});

describe("VPN and anonymous-network classification", () => {
  const ip = "203.0.113.10";

  it("blocks explicitly identified high-confidence VPN, proxy or Tor connections", () => {
    for (const kind of ["vpn", "proxy", "tor"]) {
      const found = parseProxycheckResponse(reply(ip, { [kind]: true, confidence: 95 }), ip);
      expect(found?.signals).toHaveLength(1);
      expect(shouldDenyPrivacy(found)).toBe(true);
    }
  });

  it("never blocks merely because the IP is hosted, anonymous or high risk", () => {
    const found = parseProxycheckResponse(reply(ip, {
      vpn: false, proxy: false, tor: false, hosting: true, anonymous: true,
      risk: 99, confidence: 100,
    }), ip);
    expect(found?.signals).toEqual([]);
    expect(shouldDenyPrivacy(found)).toBe(false);
  });

  it("keeps uncertain confidence in monitoring only", () => {
    expect(shouldDenyPrivacy(parseProxycheckResponse(reply(ip, { vpn: true, confidence: 85 }), ip))).toBe(false);
    expect(shouldDenyPrivacy(parseProxycheckResponse(reply(ip, { vpn: true, confidence: null }), ip))).toBe(false);
  });

  it("fails open on denied, missing or malformed provider data", () => {
    expect(parseProxycheckResponse({ status: "denied" }, ip)).toBeNull();
    expect(parseProxycheckResponse(reply(ip, { unknown: true }), ip)).toBeNull();
    expect(parseProxycheckResponse(reply(ip, { vpn: true }), "192.0.2.5")).toBeNull();
  });

  it("classifies provider denials without retaining arbitrary server response content", () => {
    expect(classifyProxycheckDenial(403, "Your daily query quota has been exceeded")).toBe("quota_exhausted");
    expect(classifyProxycheckDenial(403, "100 queries exhausted, if you sign up for a free API key")).toBe("unregistered_100_exhausted");
    expect(classifyProxycheckDenial(403, "1,000 Free queries exhausted. Please try again tomorrow")).toBe("registered_1000_exhausted");
    expect(classifyProxycheckDenial(403, "1,000 Free queries exhausted and a burst token has already been consumed")).toBe("registered_1000_exhausted");
    expect(classifyProxycheckDenial(403, "Invalid API key")).toBe("credential_denied");
    expect(classifyProxycheckDenial(403, "This request originates from a proxy server")).toBe("caller_proxy_denied");
    expect(classifyProxycheckDenial(429, "Too Many Requests")).toBe("rate_limited");
    expect(classifyProxycheckDenial(403, "Forbidden for this client")).toBe("access_denied");
    expect(classifyProxycheckDenial(403, "Visitor 203.0.113.10 token=secret")).toBe("unclassified_denial");
  });

  it("prefers active Worker secrets and safely classifies mismatches", () => {
    const worker = "abcdef-123456-abcdef-123456";
    const stale = "aaaaaa-bbbbbb-cccccc-dddddd";
    expect(chooseProxycheckKey(worker, stale)).toEqual({
      key: worker, source: "worker", mismatch: true, formatUnusual: false,
    });
    expect(chooseProxycheckKey(undefined, stale).source).toBe("process");
    expect(chooseProxycheckKey(null, null).source).toBe("missing");
    expect(chooseProxycheckKey("  ", "   ").key).toBeNull();
    expect(chooseProxycheckKey("unusual", undefined)).toMatchObject({
      source: "worker", formatUnusual: true,
    });
    const request = { runtime: { cloudflare: { env: { PROXYCHECK_API_KEY: worker } } } } as unknown as Request;
    expect(getWorkerProxycheckBinding(request)).toBe(worker);
    expect(readProxycheckKey(request).source).toBe("worker");
    expect(getWorkerProxycheckBinding(new Request("https://example.test"))).toBeUndefined();
  });

  it("classifies fixed credential-format categories", () => {
    expect(proxycheckKeyShape(null)).toBe("missing");
    expect(proxycheckKeyShape("example")).toBe("wrong_grouping");
    expect(proxycheckKeyShape("example value")).toBe("whitespace");
    expect(proxycheckKeyShape("https://example.test")).toBe("url");
  });

  it("returns a non-cacheable 403 with an explicit VPN-off instruction", async () => {
    const response = privacyRestrictedResponse();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain("turn off your VPN");
  });
});

describe("temporary Brooklyn VPN exemption", () => {
  const brooklyn = { city: "Brooklyn", region: "New York", country: "US" };
  const vpn = { ...brooklyn, signals: ["VPN"] as const, confidence: 95, operator: null };

  it("allows positively detected VPN exits in Brooklyn, New York", () => {
    expect(isTemporaryBrooklynVpnException(brooklyn, true, false)).toBe(true);
    expect(isTemporaryBrooklynVpnException({ city: " BROOKLYN ", region: " NY ", country: " usa " }, true, false)).toBe(true);
    expect(shouldBlockPrivacy({ ...vpn, signals: ["VPN"] }, false, true)).toBe(false);
    // Also exempt when a strict list or secondary provider detected the VPN.
    expect(shouldBlockPrivacy(null, true, true)).toBe(false);
  });

  it("does not exempt other cities, states, countries, or unknown geography", () => {
    for (const location of [
      { city: "New York", region: "New York", country: "US" },
      { city: "Queens", region: "New York", country: "US" },
      { city: "Brooklyn", region: "New Jersey", country: "US" },
      { city: "Brooklyn", region: "New York", country: "CA" },
      { city: null, region: "New York", country: "US" },
      { city: "Brooklyn", region: null, country: "US" },
      { city: "Brooklyn", region: "New York", country: null },
    ]) {
      expect(isTemporaryBrooklynVpnException(location, true, false)).toBe(false);
    }
    expect(shouldBlockPrivacy({ ...vpn, signals: ["VPN"] }, false, false)).toBe(true);
    expect(shouldBlockPrivacy(null, true, false)).toBe(true);
  });

  it("retains Tor, proxy-only, and unrelated blocking rules", () => {
    expect(isTemporaryBrooklynVpnException(brooklyn, false, false)).toBe(false);
    expect(isTemporaryBrooklynVpnException(brooklyn, true, true)).toBe(false);
    expect(shouldBlockPrivacy({ ...vpn, signals: ["Tor"] }, false, false)).toBe(true);
    expect(shouldBlockPrivacy({ ...vpn, signals: ["Proxy"] }, false, false)).toBe(true);
    expect(shouldBlockPrivacy(null, false, false)).toBe(false);
  });
});

describe("iCloud Private Relay false-positive exception", () => {
  const privateRelay = {
    signals: ["VPN"] as ("VPN" | "Proxy" | "Tor")[],
    confidence: 100,
    operator: "iCloud",
    city: "Richmond",
    region: "Virginia",
    country: "US",
  };
  const cleanSecondary = { proxy: false, tor: false };

  it("permits confirmed iCloud relay even when the strict VPN list also flags it", () => {
    expect(isIcloudPrivateRelayException(privateRelay, cleanSecondary, "VPN")).toBe(true);
    expect(shouldBlockPrivacy(privateRelay, true, false, true)).toBe(false);
    expect(isIcloudPrivateRelayException({ ...privateRelay, operator: "iCloud Private Relay" }, cleanSecondary, "VPN")).toBe(true);
  });

  it("does not exempt other VPN providers or spoofable partial names", () => {
    for (const operator of [null, "Apple", "Apple VPN", "NordVPN", "Fake iCloud VPN", "iCloud Proxy"]) {
      expect(isIcloudPrivateRelayException({ ...privateRelay, operator }, cleanSecondary, "VPN")).toBe(false);
    }
    expect(isIcloudPrivateRelayException({ ...privateRelay, confidence: 85 }, cleanSecondary, "VPN")).toBe(false);
    expect(isIcloudPrivateRelayException(null, cleanSecondary, "VPN")).toBe(false);
  });

  it("still blocks proxy and Tor detections from any independent source", () => {
    expect(isIcloudPrivateRelayException({ ...privateRelay, signals: ["VPN", "Tor"] }, cleanSecondary, "VPN")).toBe(false);
    expect(isIcloudPrivateRelayException({ ...privateRelay, signals: ["VPN", "Proxy"] }, cleanSecondary, "VPN")).toBe(false);
    expect(isIcloudPrivateRelayException(privateRelay, { proxy: true, tor: false }, "VPN")).toBe(false);
    expect(isIcloudPrivateRelayException(privateRelay, { proxy: false, tor: true }, "VPN")).toBe(false);
    expect(isIcloudPrivateRelayException(privateRelay, cleanSecondary, "Tor")).toBe(false);
    expect(shouldBlockPrivacy(privateRelay, true, false, false)).toBe(true);
  });
});
