import { describe, expect, it } from "vitest";
import { isOpenPdfClick, openPdfClicksForReport, summarizeOpenPdfClicks, type OpenPdfRow } from "./open-pdf-clicks";

const row = (o: Partial<OpenPdfRow>): OpenPdfRow => ({
  event_name: "publication_click", event_id: Math.random().toString(36), occurred_at: "2026-10-08T12:00:00Z",
  visitor_id: "v1", session_id: "s1", path: "/", publication_id: "p1", publication_title: "Aderaba",
  metadata: { action: "open_pdf" }, ...o,
});

describe("Open PDF click recognition", () => {
  it("counts only tagged publication_click", () => {
    expect(isOpenPdfClick(row({}))).toBe(true);
    expect(isOpenPdfClick(row({ metadata: {} }))).toBe(false); // legacy untagged
    expect(isOpenPdfClick(row({ metadata: null }))).toBe(false);
    expect(isOpenPdfClick(row({ event_name: "pdf_open" }))).toBe(false); // automatic preview
    expect(isOpenPdfClick(row({ event_name: "download", metadata: { action: "open_pdf" } }))).toBe(false);
  });

  it("does not double count retried deliveries", () => {
    const r = row({ event_id: "same" });
    expect(summarizeOpenPdfClicks([r, { ...r }]).total).toBe(1);
  });

  it("groups by publication and site location", () => {
    const s = summarizeOpenPdfClicks([
      row({ path: "/" }), row({ path: "/archive" }), row({ path: "/parsha/bereishis", publication_id: "p2", publication_title: "Torah Tavlin" }),
      row({ path: "/view/p1" }), row({ event_name: "pdf_open", path: "/view/p1" }), row({ metadata: {} }),
    ]);
    expect(s.total).toBe(4);
    expect(s.byPublication[0]).toMatchObject({ publicationId: "p1", clicks: 3 });
    expect(s.byPage.map((p) => p.page).sort()).toEqual(["Archive", "Homepage", "PDF detail page (/view)", "Parsha page (/parsha/bereishis)"]);
  });

  it("excludes internal/bot sessions from the headline but keeps raw count", () => {
    const r = openPdfClicksForReport([row({ session_id: "human" }), row({ session_id: "bot" }), row({ session_id: "internal" })], new Set(["human"]));
    expect(r.total).toBe(1);
    expect(r.rawTotal).toBe(3);
    expect(r.excluded).toBe(2);
  });
});
