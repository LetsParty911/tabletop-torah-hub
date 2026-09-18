import { describe, expect, it } from "vitest";
import {
  buildTrackingUrl,
  formatCountRate,
  normalizeTrackingValue,
  shouldShowRate,
} from "./admin-analytics-display";

describe("admin analytics presentation rules", () => {
  it("uses counts for small samples", () => {
    expect(shouldShowRate(9)).toBe(false);
    expect(formatCountRate(2, 9)).toBe("2 of 9");
    expect(formatCountRate(2, 10)).toContain("20%");
  });

  it("normalizes campaign values and rejects incomplete links", () => {
    expect(normalizeTrackingValue("  Bergen County / WhatsApp  ")).toBe(
      "bergen-county-whatsapp",
    );
    expect(
      buildTrackingUrl({
        baseUrl: "https://torahforthetable.com/",
        source: "Bergen County",
        medium: "WhatsApp",
        campaign: "Ha'azinu 5787",
      }),
    ).toBe(
      "https://torahforthetable.com/?utm_source=bergen-county&utm_medium=whatsapp&utm_campaign=ha-azinu-5787",
    );
    expect(
      buildTrackingUrl({ baseUrl: "not a url", source: "a", medium: "b", campaign: "c" }),
    ).toBeNull();
  });
});