import { describe, expect, it } from "vitest";
import { isShulPosterSource, normalizeSourceGroup } from "./source-group";

const classify = (source: string | null, medium: string | null, host: string | null = null, campaign: string | null = null) =>
  normalizeSourceGroup({ utm_source: source, utm_medium: medium, referrer_host: host, utm_campaign: campaign });

describe("shul poster source attribution", () => {
  it("classifies the approved /s campaign as Shul Poster", () => {
    expect(classify("shul", "poster", null, "evergreen_poster_oct2026")).toBe("Shul Poster");
  });

  it("matches case and surrounding whitespace without changing the UTM values", () => {
    expect(isShulPosterSource({ utm_source: " SHUL ", utm_medium: " Poster " })).toBe(true);
    expect(classify(" SHUL ", " Poster ")).toBe("Shul Poster");
  });

  it("does not confuse workplace posters or other shul campaign media", () => {
    expect(classify("workplace", "poster")).toBe("Other Campaign");
    expect(classify("shul", "email")).toBe("Email");
    expect(classify("shul-news", "poster")).toBe("Other Campaign");
  });

  it("keeps existing WhatsApp, email, Google, and direct buckets unchanged", () => {
    expect(classify("whatsapp", "social")).toBe("WhatsApp");
    expect(classify("ourkehilla", "email")).toBe("Email");
    expect(classify(null, null, "www.google.com")).toBe("Google");
    expect(classify(null, null)).toBe("Direct");
  });
});
