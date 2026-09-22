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
