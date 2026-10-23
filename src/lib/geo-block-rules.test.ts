import { describe, it, expect } from "vitest";
import { isBlockedIp, shouldCheckBlockedIp, matchBlockedCity, BLOCKED_CITIES } from "./geo-block.server";

describe("exact IP block", () => {
  it("matches only the exact IP", () => {
    expect(isBlockedIp("12.75.139.6")).toBe(true);
    expect(isBlockedIp(" 12.75.139.6 ")).toBe(true);
    expect(isBlockedIp("12.75.139.60")).toBe(false);
    expect(isBlockedIp("12.75.139.7")).toBe(false);
    expect(isBlockedIp(null)).toBe(false);
  });
  it("covers pages, PDFs, downloads and APIs but not admin/server functions", () => {
    for (const p of ["/", "/view/x", "/view/x/pdf", "/view/x/download", "/api/track-view", "/r"]) {
      expect(shouldCheckBlockedIp(p)).toBe(true);
    }
    for (const p of ["/admin", "/admin-analytics", "/_serverFn/abc"]) {
      expect(shouldCheckBlockedIp(p)).toBe(false);
    }
  });
});

describe("Fulton, KY city rule", () => {
  it("blocks exact Fulton + Kentucky + US", () => {
    expect(matchBlockedCity({ city: "Fulton", region: "Kentucky", country: "US" })?.label).toBe("Fulton, KY");
    expect(matchBlockedCity({ city: "fulton", region: "KY", country: "us" })).not.toBeNull();
  });
  it("does not block other Kentucky cities or other Fultons", () => {
    expect(matchBlockedCity({ city: "Louisville", region: "Kentucky", country: "US" })).toBeNull();
    expect(matchBlockedCity({ city: "Fulton", region: "New York", country: "US" })).toBeNull();
    expect(matchBlockedCity({ city: "Fulton", region: "Kentucky", country: "CA" })).toBeNull();
  });
  it("keeps the existing ten rules", () => {
    expect(BLOCKED_CITIES.length).toBe(11);
  });
});

describe("Langhorne, PA city rule", () => {
  it("blocks exact Langhorne, Pennsylvania, US, including abbreviation", () => {
    expect(matchBlockedCity({ city: "Langhorne", region: "Pennsylvania", country: "US" })?.label).toBe("Langhorne, PA");
    expect(matchBlockedCity({ city: "langhorne", region: "PA", country: "us" })?.label).toBe("Langhorne, PA");
  });
  it("does not block neighboring towns or other states", () => {
    expect(matchBlockedCity({ city: "Newtown", region: "PA", country: "US" })).toBeNull();
    expect(matchBlockedCity({ city: "Langhorne", region: "NJ", country: "US" })).toBeNull();
    expect(matchBlockedCity({ city: "Langhorne", region: "PA", country: "CA" })).toBeNull();
  });
});
