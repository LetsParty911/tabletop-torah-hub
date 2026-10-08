// Unit tests for the Used Torah owner metric (pure helpers used by the real report builder).
import { describe, expect, it } from "vitest";
import { isUsedTorahEvent, usedTorahQualification, usedTorahVisitorIds } from "@/integrations/supabase/admin-analytics-canonical";
import { openPdfClicksForReport } from "./open-pdf-clicks";

const click = (o: Record<string, unknown> = {}) => ({ event_name: "publication_click", metadata: { action: "open_pdf" }, ...o });

describe("Used Torah with tagged Open PDF clicks", () => {
  it("click-only session qualifies with a truthful reason", () => {
    expect(usedTorahQualification([{ event_name: "page_view" }, click()])).toBe("Clicked Open PDF");
  });
  it("untagged selection, impressions, page views and unrelated metadata do not qualify", () => {
    expect(usedTorahQualification([{ event_name: "publication_click", metadata: {} }, { event_name: "publication_impression" }, { event_name: "page_view", metadata: { action: "open_pdf" } }, click({ metadata: { action: "share" } }), click({ metadata: { action: "open_pdf_x" } })])).toBeNull();
    expect(usedTorahQualification(["publication_click"])).toBeNull(); // bare name can never be tagged
    expect(isUsedTorahEvent({ event_name: "publication_click", metadata: null })).toBe(false);
    expect(isUsedTorahEvent(click())).toBe(true);
  });
  it("keeps existing priority: download > viewer open > Open PDF click > share > signup", () => {
    expect(usedTorahQualification([click(), { event_name: "pdf_open" }, { event_name: "download" }])).toBe("Requested a download");
    expect(usedTorahQualification([click(), { event_name: "pdf_open" }])).toBe("Opened a PDF");
    expect(usedTorahQualification([click(), { event_name: "share_click" }, { event_name: "signup" }])).toBe("Clicked Open PDF");
    expect(usedTorahQualification(["share_click", "signup"])).toBe("Shared Torah");
  });
  it("counts each visitor once across repeated clicks and combined click+viewer+download", () => {
    const ids = usedTorahVisitorIds([
      { visitorId: "v1", events: [click(), click(), click()] },
      { visitorId: "v1", events: [click()] }, // second session, same visitor
      { visitorId: "v2", events: [click(), { event_name: "pdf_open" }, { event_name: "download" }] },
      { visitorId: "v3", events: [{ event_name: "publication_click", metadata: {} }] },
      { visitorId: null, events: [click()] },
    ]);
    expect([...ids].sort()).toEqual(["v1", "v2"]);
  });
  it("bot/internal sessions excluded by the shared classifier never reach Used Torah", () => {
    const rows = [
      { event_name: "publication_click", occurred_at: "2026-10-08T12:00:00Z", visitor_id: "human", session_id: "h", path: "/", publication_id: "p", publication_title: "P", metadata: { action: "open_pdf" } },
      { event_name: "publication_click", occurred_at: "2026-10-08T12:00:00Z", visitor_id: "bot", session_id: "b", path: "/", publication_id: "p", publication_title: "P", metadata: { action: "open_pdf" } },
    ];
    const kept = new Set(["h"]); // classifier output
    const keptRows = openPdfClicksForReport(rows, kept).keptRows;
    expect([...usedTorahVisitorIds([{ visitorId: "human", events: keptRows }])]).toEqual(["human"]);
  });
});
