import { describe, expect, it, vi } from "vitest";
import { formatReferralLines, getEngagedReferralLines } from "../../docs/visitor-alert-fix/visitor-alert/referral-attribution";

describe("Pushover referral attribution", () => {
  it("labels Sender.net and its corrected email campaign", () => {
    expect(formatReferralLines({
      utm_source: "sender.net",
      utm_campaign: "chayei_sarah_5787_corrected",
      utm_content: "graphic",
    })).toEqual(["Source: Sender.net", "Campaign: chayei sarah 5787 corrected", "Link: Graphic"]);
  });
  it("labels OurKehilla without confusing Gmail with campaign provenance", () => {
    expect(formatReferralLines({
      utm_source: "ourkehilla",
      referrer_host: "com.google.android.gm",
      utm_campaign: "chayei_sarah_5787",
    })[0]).toBe("Source: OurKehilla");
  });
  it("identifies tagged WhatsApp groups independently", () => {
    expect(formatReferralLines({
      utm_source: "whatsapp",
      utm_content: "our_side_of_main",
    })).toEqual(["Source: WhatsApp", "Group: Our Side of Main"]);
    expect(formatReferralLines({
      utm_source: "whatsapp",
      utm_content: "passaic_clifton",
    })).toEqual(["Source: WhatsApp", "Group: Passaic / Clifton"]);
  });
  it("uses observed referrer host when no campaign exists", () => {
    expect(formatReferralLines({ referrer_host: "www.google.com" })).toEqual(["Source: Google"]);
    expect(formatReferralLines({ referrer_host: "r.email1.shopfeed.com" })).toEqual(["Source: r.email1.shopfeed.com"]);
    expect(formatReferralLines(null)).toEqual(["Source: Direct / Unknown"]);
  });
  it("resolves session_start before page_view without exposing credentials in output", async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.includes("session_start")) return new Response(JSON.stringify([{ utm_source: "sender.net" }]));
      throw new Error("Should not query page_view");
    });
    const lines = await getEngagedReferralLines("session-1", "https://example.supabase.co", "secret-key", mock as unknown as typeof fetch);
    expect(lines).toEqual(["Source: Sender.net"]);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(String(mock.mock.calls[0][0])).toContain("session_id=eq.session-1");
  });
  it("falls back to the earliest page_view when no session_start exists", async () => {
    const mock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("session_start") ? [] : [{ utm_source: "whatsapp", utm_content: "czs_announcements" }],
    )));
    expect(await getEngagedReferralLines("session-2", "https://example.supabase.co", "key", mock as unknown as typeof fetch))
      .toEqual(["Source: WhatsApp", "Group: CZS Announcements"]);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("fails open on lookup errors, without fabricating a direct source", async () => {
    const mock = vi.fn(async () => new Response("{}", { status: 503 }));
    expect(await getEngagedReferralLines("session-3", "https://example.supabase.co", "key", mock as unknown as typeof fetch))
      .toEqual(["Source: Unavailable"]);
  });
});
