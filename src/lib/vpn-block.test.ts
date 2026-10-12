import { describe, expect, it } from "vitest";
import { parseProxycheckResponse, shouldDenyPrivacy, privacyRestrictedResponse } from "./vpn-block.server";

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

  it("returns a non-cacheable 403 with an explicit VPN-off instruction", async () => {
    const response = privacyRestrictedResponse();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).toContain("turn off your VPN");
  });
});
