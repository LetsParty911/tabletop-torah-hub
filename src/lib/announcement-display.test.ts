import { describe, it, expect } from "vitest";
import { resolveAnnouncementDisplay } from "./announcement-display";

const base = { enabled: true, text: "Yom Tov schedule posted", linkUrl: null, linkLabel: null };

describe("announcement banner display", () => {
  it("hides when disabled, even with saved text", () => {
    expect(resolveAnnouncementDisplay({ ...base, enabled: false })).toBeNull();
  });
  it("hides when enabled but text empty/whitespace (current saved state)", () => {
    expect(resolveAnnouncementDisplay({ ...base, text: null })).toBeNull();
    expect(resolveAnnouncementDisplay({ ...base, text: "   " })).toBeNull();
    expect(resolveAnnouncementDisplay(null)).toBeNull();
  });
  it("shows the saved text exactly (trimmed) with no link", () => {
    expect(resolveAnnouncementDisplay({ ...base, text: "  Hello  " })).toEqual({ text: "Hello", linkUrl: null, linkLabel: null, isExternal: false });
  });
  it("uses the saved link and marks external links", () => {
    const d = resolveAnnouncementDisplay({ ...base, linkUrl: "https://x.org", linkLabel: "Read" });
    expect(d).toMatchObject({ linkUrl: "https://x.org", linkLabel: "Read", isExternal: true });
  });
  it("adds Subscribe link only for email/subscribe text without a saved link", () => {
    expect(resolveAnnouncementDisplay({ ...base, text: "Get the weekly email" })).toMatchObject({ linkUrl: "#weekly-email-signup", linkLabel: "Subscribe", isExternal: false });
  });
});
