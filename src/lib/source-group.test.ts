import { describe, expect, it } from "vitest";
import { isShulPosterSource, normalizeSourceGroup, sourceGroupForIngest } from "./source-group";

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
    expect(classify("ourkehilla", "email")).toBe("OurKehilla Email");
    expect(classify("sender", "email")).toBe("Sender.net Email");
    expect(classify("newsletter", "email")).toBe("Email");
    expect(classify(null, null, "www.google.com")).toBe("Google");
    expect(classify(null, null)).toBe("Direct");
  });
  it("keeps branded email attribution distinct for the accepted UTM parameters", () => {
    expect(classify(" OURKEHILLA ", " EMAIL ")).toBe("OurKehilla Email");
    expect(classify("sender", "newsletter")).toBe("Sender.net Email");
    expect(classify("sender", "social")).toBe("Other Campaign");
    expect(classify("ourkehilla", "poster")).toBe("Other Campaign");
  });

  it("enforces tagged email sources at event ingest even from an older browser bundle", () => {
    const input = (utm_source: string, utm_medium: string) => ({
      referrer_host: null,
      utm_source,
      utm_medium,
      utm_campaign: "lech_lecha_5787",
    });
    expect(sourceGroupForIngest(input("ourkehilla", "email"), "Email")).toBe("OurKehilla Email");
    expect(sourceGroupForIngest(input("sender", "email"), "Email")).toBe("Sender.net Email");
    expect(sourceGroupForIngest(input("shul", "poster"), "Email")).toBe("Shul Poster");
    expect(sourceGroupForIngest(input("newsletter", "email"), "Email")).toBe("Email");
    expect(sourceGroupForIngest(input("whatsapp", "social"), "WhatsApp")).toBe("WhatsApp");
    expect(sourceGroupForIngest(input("unknown", "qr"), null)).toBe("Direct");
  });

});
