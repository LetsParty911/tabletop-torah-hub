import { describe, expect, it } from "vitest";
import { csvCell, formatNyClockSeconds, isOpenPdfClick, openPdfClickReferrer, openPdfClicksForReport, shapeOpenPdfClickDetails, summarizeOpenPdfClicks, type OpenPdfRow } from "./open-pdf-clicks";

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

describe("Open PDF click detail shaping", () => {
  const base = (r: OpenPdfRow & { referrer_host?: string | null }) => ({ at: r.occurred_at, publicationId: r.publication_id, referrer: r.referrer_host ?? null });

  it("falls back to recorded first-touch referrer only, never inventing one", () => {
    const withFirst = { ...row({ occurred_at: "2026-10-08T12:00:00Z", metadata: { action: "open_pdf", first_touch_referrer_host: " chat.whatsapp.com " } }), referrer_host: null };
    const none = { ...row({ occurred_at: "2026-10-08T13:00:00Z", metadata: { action: "open_pdf", first_touch_referrer_host: "  " } }), referrer_host: "" };
    const out = shapeOpenPdfClickDetails([withFirst, none], base);
    expect(out.map((d) => d.at)).toEqual(["2026-10-08T13:00:00Z", "2026-10-08T12:00:00Z"]); // newest first
    expect(out[0].referrer).toBeNull();
    expect(out[1].referrer).toBe("chat.whatsapp.com");
    expect(openPdfClickReferrer({ referrer_host: "google.com", metadata: { first_touch_referrer_host: "x.com" } })).toBe("google.com");
  });

  it("final report details respect human filter and keep metadata", () => {
    const rows = [row({ session_id: "human", publication_id: "p9", occurred_at: "2026-10-08T10:00:00Z" }), row({ session_id: "bot" })];
    const r = openPdfClicksForReport(rows, new Set(["human"]));
    const details = shapeOpenPdfClickDetails(r.keptRows, base);
    expect(details).toHaveLength(1);
    expect(details[0]).toMatchObject({ publicationId: "p9", at: "2026-10-08T10:00:00Z" });
  });

  it("formats New York clock to the second across DST", () => {
    expect(formatNyClockSeconds("2026-10-08T19:27:05Z")).toBe("Oct 8, 3:27:05 PM");
    expect(formatNyClockSeconds("2026-12-01T05:00:09Z")).toBe("Dec 1, 12:00:09 AM");
  });

  it("escapes CSV cells", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(null)).toBe("");
    expect(csvCell("plain")).toBe("plain");
  });
});

describe("Unique PDFs opened", () => {
  it("repeated clicks on one doc + one on another: 4 clicks, 2 PDFs, 1 reader", () => {
    const s = summarizeOpenPdfClicks([row({}), row({}), row({}), row({ publication_id: "p2", publication_title: "Other" })]);
    expect(s.total).toBe(4);
    expect(s.uniquePublications).toBe(2);
    expect(s.uniqueVisitors).toBe(1);
  });
  it("same title, different IDs stay distinct", () => {
    const s = summarizeOpenPdfClicks([row({ publication_id: "a" }), row({ publication_id: "b" })]);
    expect(s.uniquePublications).toBe(2);
    expect(s.byPublication).toHaveLength(2);
  });
  it("retried transport with same event_id counts once", () => {
    const s = summarizeOpenPdfClicks([row({ event_id: "x" }), row({ event_id: "x" }), row({ event_id: "y", publication_id: "p2" })]);
    expect(s.total).toBe(2);
    expect(s.uniquePublications).toBe(2);
  });
  it("missing IDs are not guessed from titles and are reported", () => {
    const s = summarizeOpenPdfClicks([row({ publication_id: null }), row({ publication_id: "  " }), row({})]);
    expect(s.total).toBe(3);
    expect(s.uniquePublications).toBe(1);
    expect(s.clicksMissingPublicationId).toBe(2);
    expect(s.byPublication.filter((p) => p.publicationId === null)).toHaveLength(2);
  });
  it("ignores automatic previews, untagged selections, downloads", () => {
    const s = summarizeOpenPdfClicks([
      row({ event_name: "pdf_open", publication_id: "z1" }),
      row({ metadata: {}, publication_id: "z2" }),
      row({ event_name: "download", publication_id: "z3" }),
    ]);
    expect(s.total).toBe(0);
    expect(s.uniquePublications).toBe(0);
  });
  it("bot/internal sessions excluded from headline but kept in raw", () => {
    const r = openPdfClicksForReport([row({ session_id: "human" }), row({ session_id: "bot", publication_id: "p9" })], new Set(["human"]));
    expect(r.uniquePublications).toBe(1);
    expect(r.rawUniquePublications).toBe(2);
    expect(r.excluded).toBe(1);
  });
  it("period filtering: only rows passed in are counted (range applied upstream)", () => {
    const all = [row({ occurred_at: "2026-10-01T00:00:00Z", publication_id: "old" }), row({ occurred_at: "2026-10-08T00:00:00Z" })];
    const inRange = all.filter((r) => r.occurred_at >= "2026-10-05");
    expect(summarizeOpenPdfClicks(inRange).uniquePublications).toBe(1);
  });
  it("matches byPublication rows with IDs and sums to total", () => {
    const s = summarizeOpenPdfClicks([row({}), row({}), row({ publication_id: "p2" }), row({ publication_id: null })]);
    expect(s.byPublication.filter((p) => p.publicationId).length).toBe(s.uniquePublications);
    expect(s.byPublication.reduce((n, p) => n + p.clicks, 0)).toBe(s.total);
  });
});
