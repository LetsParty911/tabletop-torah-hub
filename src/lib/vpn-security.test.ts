import { describe, expect, it } from "vitest";
import {
  BLOCK_SUPPRESS_MS, FAILURE_SUPPRESS_MS, FailureTracker, blockDedupeKey, buildAttribution,
  classifyProviderFailure, DETECTORS,
} from "./vpn-security";

describe("detector attribution", () => {
  it("records every simultaneous detector", () => {
    const a = buildAttribution({
      proxycheck: { signals: ["VPN"], confidence: 95 }, proxycheckStatus: "ok", proxycheckQualifies: true,
      ipapi: { vpn: true, proxy: false, tor: false }, ipapiStatus: "ok", listSignal: "VPN", listStatus: "ok",
    });
    expect(a.detectedBy).toEqual([DETECTORS.proxycheck, DETECTORS.ipapi, DETECTORS.strictVpn]);
  });
  it("does not credit Proxycheck below the confidence bar, and marks provider errors", () => {
    const a = buildAttribution({
      proxycheck: null, proxycheckStatus: "http_429_registered_1000_exhausted_key_present_worker", proxycheckQualifies: false,
      ipapi: null, ipapiStatus: "timeout", listSignal: "Tor", listStatus: "ok",
    });
    expect(a.detectedBy).toEqual([DETECTORS.tor]);
    expect(a.providerResults[DETECTORS.proxycheck]).toMatchObject({ ok: false, failure: "quota" });
    expect(a.providerResults[DETECTORS.ipapi]).toMatchObject({ ok: false, failure: "failure" });
  });
});

describe("failure classification", () => {
  it("separates quota, credentials and generic failures", () => {
    expect(classifyProviderFailure("proxycheck", "ok")).toBeNull();
    expect(classifyProviderFailure("proxycheck", "http_403_credential_denied_key_present_worker")).toBe("credentials");
    expect(classifyProviderFailure("ipapi", "quota_or_rate_limit")).toBe("quota");
    expect(classifyProviderFailure("ipapi", "access_denied")).toBe("credentials");
    expect(classifyProviderFailure("proxycheck", "timeout")).toBe("failure");
    expect(classifyProviderFailure("lists", "stale")).toBeNull();
    expect(classifyProviderFailure("lists", "lists_unavailable")).toBe("failure");
  });
});

describe("alert suppression", () => {
  it("mutes repeat block alerts from one IP for 30 minutes", () => {
    const t = new FailureTracker(); const now = 1_800_000_000_000;
    expect(t.shouldAlertBlock("1.2.3.4", now)).toBe(true);
    expect(t.shouldAlertBlock("1.2.3.4", now + BLOCK_SUPPRESS_MS - 1)).toBe(false);
    expect(t.shouldAlertBlock("5.6.7.8", now)).toBe(true);
    expect(t.shouldAlertBlock("1.2.3.4", now + BLOCK_SUPPRESS_MS)).toBe(true);
    expect(blockDedupeKey("1.2.3.4", now)).toMatch(/^vpn_blocked:1\.2\.3\.4:\d+$/);
  });
  it("alerts quota at once, generic failures after 3 in a row, then suppresses", () => {
    const t = new FailureTracker(); const now = 1_800_000_000_000;
    expect(t.record("proxycheck", "quota", now)).toBe("quota");
    expect(t.record("proxycheck", "quota", now + 1000)).toBeNull();
    expect(t.record("ipapi", "failure", now)).toBeNull();
    expect(t.record("ipapi", "failure", now + 1)).toBeNull();
    expect(t.record("ipapi", "failure", now + 2)).toBe("failure");
    expect(t.record("ipapi", "failure", now + 3)).toBeNull();
    expect(t.record("ipapi", "failure", now + FAILURE_SUPPRESS_MS + 10)).toBeNull(); // streak window expired, restarts
  });
  it("a success resets the failure streak (recovery)", () => {
    const t = new FailureTracker(); const now = 1_800_000_000_000;
    t.record("lists", "failure", now); t.record("lists", "failure", now + 1);
    t.record("lists", null, now + 2);
    expect(t.record("lists", "failure", now + 3)).toBeNull();
  });
});
