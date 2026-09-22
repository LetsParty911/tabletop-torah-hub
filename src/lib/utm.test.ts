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

describe("utm_content", () => {
  it("is omitted when not supplied, keeping existing callers unchanged", () => {
    expect(withUtm("https://torahforthetable.com/", params)).not.toContain("utm_content");
  });

  it("is added and normalized when supplied", () => {
    const url = withUtm("https://torahforthetable.com/", { ...params, content: "Message A" });
    expect(url).toContain("utm_content=message-a");
  });

  it("leaves an inbound utm_content alone unless replacement is requested", () => {
    const url = withUtm("https://torahforthetable.com/?utm_content=inbound", {
      ...params,
      content: "message-a",
    });
    expect(url).toContain("utm_content=inbound");
    expect(
      withUtm("https://torahforthetable.com/?utm_content=inbound", { ...params, content: "message-a" }, { replace: true }),
    ).toContain("utm_content=message-a");
  });

  it("preserves other query parameters and the hash with content set", () => {
    const url = withUtm("https://torahforthetable.com/?filter=kids#list", { ...params, content: "qr-a" });
    expect(url).toContain("filter=kids");
    expect(url.endsWith("#list")).toBe(true);
  });
});
