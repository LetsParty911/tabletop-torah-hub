import { describe, expect, it } from "vitest";
import { summarizeHomepageSharing, type HomepageSharingEvent } from "./homepage-sharing";

const at = (event_name: string, opts: Partial<HomepageSharingEvent> = {}): HomepageSharingEvent => ({
  event_name,
  occurred_at: "2026-10-08T12:00:00Z",
  visitor_id: "visitor-a",
  session_id: "session-a",
  ...opts,
});

const tagged = {
  utm_source: "whatsapp",
  utm_medium: "share",
  utm_campaign: "weekly-share",
};

describe("homepage sharing analytics", () => {
  it("counts only homepage-placed WhatsApp button clicks", () => {
    const result = summarizeHomepageSharing([
      at("share_click", { metadata: { placement: "homepage_veahavta", share_method: "whatsapp" } }),
      at("share_click", { metadata: { placement: "homepage_veahavta", share_method: "whatsapp" } }),
      at("share_click", { metadata: { share_method: "whatsapp" } }),
      at("share_click", { metadata: { placement: "homepage_veahavta", share_method: "copy_link" } }),
    ]);
    expect(result.buttonClicks).toBe(2);
    expect(result.clickingBrowsers).toBe(1);
    expect(result.linkSessions).toBe(0);
  });

  it("deduplicates attributed sessions/visitors and counts content actions only in them", () => {
    const result = summarizeHomepageSharing([
      at("page_view", { ...tagged }),
      at("page_view", { ...tagged }),
      at("download", { ...tagged }),
      at("pdf_open", { ...tagged }),
      at("download", { session_id: "unattributed", ...tagged }),
      at("page_view", { session_id: "session-b", visitor_id: "visitor-b", ...tagged }),
      at("download", { session_id: "session-b", visitor_id: "visitor-b" }),
      at("page_view", { session_id: "external", visitor_id: "visitor-c", utm_campaign: "publication-share" }),
    ]);
    expect(result.linkSessions).toBe(2);
    expect(result.linkVisitors).toBe(2);
    expect(result.linkDownloads).toBe(1);
    expect(result.linkPdfOpens).toBe(1);
  });

  it("does not treat campaign-only or PDF-sharing traffic as homepage arrivals", () => {
    const result = summarizeHomepageSharing([
      at("page_view", { utm_campaign: "weekly-share", utm_source: "newsletter", utm_medium: "email" }),
      at("page_view", { utm_campaign: "publication-share", utm_source: "whatsapp", utm_medium: "share" }),
    ]);
    expect(result.linkSessions).toBe(0);
    expect(result.linkDownloads).toBe(0);
  });
  it("attributes only the same counted, capped PDF actions and never automatic previews", () => {
    const page = at("page_view", { ...tagged });
    const click = at("publication_click", { ...tagged, metadata: { action: "open_pdf" } });
    const preview = at("pdf_open", { ...tagged });
    const ignored = at("publication_click", { session_id: "no-tagged-page", metadata: { action: "open_pdf" } });
    const result = summarizeHomepageSharing(
      [page, click, preview, ignored],
      [click, ignored], // already human-filtered, capped actions
    );
    expect(result.linkPdfOpens).toBe(1); // automatic preview audit only
    expect(result.linkCountedPdfOpens).toBe(1); // qualified deliberate request
  });

});
