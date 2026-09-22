import { describe, expect, it } from "vitest";
import { normalizeUtmValue, withUtm } from "./utm";

const params = { source: "WhatsApp", medium: "Share", campaign: "Publication Share" };

describe("normalizeUtmValue", () => {
  it("lowercases and hyphenates", () => {
    expect(normalizeUtmValue("  Weekly Share! ")).toBe("weekly-share");
  });
});

describe("withUtm", () => {
  it("adds normalized utm parameters", () => {
    const url = withUtm("https://torahforthetable.com/view/abc", params);
    expect(url).toBe(
      "https://torahforthetable.com/view/abc?utm_source=whatsapp&utm_medium=share&utm_campaign=publication-share",
    );
  });

  it("preserves other query parameters and the hash", () => {
    const url = withUtm("https://torahforthetable.com/?filter=kids#list", params);
    expect(url).toContain("filter=kids");
    expect(url.endsWith("#list")).toBe(true);
    expect(url).toContain("utm_source=whatsapp");
  });

  it("does not overwrite existing utm values by default", () => {
    const url = withUtm("https://torahforthetable.com/?utm_source=email", params);
    expect(url).toContain("utm_source=email");
    expect(url).toContain("utm_medium=share");
  });

  it("overwrites when replacement is requested", () => {
    const url = withUtm("https://torahforthetable.com/?utm_source=email", params, { replace: true });
    expect(url).toContain("utm_source=whatsapp");
  });

  it("returns the input when it is not a valid url", () => {
    expect(withUtm("/view/abc", params)).toBe("/view/abc");
  });

  it("returns the input when a value normalizes to empty", () => {
    const url = "https://torahforthetable.com/";
    expect(withUtm(url, { ...params, campaign: "  " })).toBe(url);
  });
});

describe("sender.net preset", () => {
  it("produces the expected tracking link", () => {
    expect(
      withUtm("https://torahforthetable.com/", { source: "sender", medium: "email", campaign: "Yom Kippur" }, { replace: true }),
    ).toBe("https://torahforthetable.com/?utm_source=sender&utm_medium=email&utm_campaign=yom-kippur");
  });
});
