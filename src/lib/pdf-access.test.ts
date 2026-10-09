import { describe, expect, it } from "vitest";
import { pdfAccessActions, pdfOpenRate, summarizePdfAccess, type PdfAccessRow } from "./pdf-access";

let n = 0;
const at = (m: number) => new Date(Date.UTC(2026, 9, 8, 12, m)).toISOString();
const click = (o: Partial<PdfAccessRow> = {}): PdfAccessRow => ({
  event_name: "publication_click",
  event_id: `e${n++}`,
  occurred_at: at(n),
  visitor_id: "v1",
  session_id: "s1",
  publication_id: "pdf-a",
  publication_title: "A",
  metadata: { action: "open_pdf" },
  ...o,
});
const kept = (...ids: string[]) => new Set(ids);

describe("counted PDF opens", () => {
  it("counts tagged clicks but never automatic pdf_open previews or untagged clicks", () => {
    const s = summarizePdfAccess(
      [click(), click({ event_name: "pdf_open", metadata: null }), click({ metadata: {} })],
      kept("s1"),
    );
    expect(s.counted).toBe(1);
    expect(s.automaticPreviews).toBe(1);
  });

  it("pairs legacy download + download_served by action_id and counts unmatched served once", () => {
    const rows = [
      click({ event_name: "download", metadata: { action_id: "a1" } }),
      click({ event_name: "download_served", metadata: { action_id: "a1" } }),
      click({ event_name: "download_served", metadata: { action_id: "a2" } }),
      click({ event_name: "download_served", metadata: {} }),
    ];
    const actions = pdfAccessActions(rows);
    expect(actions.map((a) => a.kind)).toEqual(["download", "download_served"]);
    expect(summarizePdfAccess(rows, kept("s1")).counted).toBe(2);
  });

  it("collapses duplicate event IDs but keeps repeat deliberate clicks distinct", () => {
    const first = click({ event_id: "same" });
    const s = summarizePdfAccess([first, { ...first }, click(), click()], kept("s1"));
    expect(s.counted).toBe(3);
    expect(s.uniquePublications).toBe(1);
  });

  it("caps at five per visitor across sessions (8 -> 5), earliest five attributed", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      click({ session_id: i < 4 ? "s1" : "s2", publication_id: i < 3 ? "pdf-a" : "pdf-b", occurred_at: at(i) }),
    );
    const s = summarizePdfAccess(rows.reverse(), kept("s1", "s2"));
    expect(s.counted).toBe(5);
    expect(s.overCap).toBe(3);
    expect(s.visitorsOverCap).toBe(1);
    expect(s.byPublication.find((p) => p.publicationId === "pdf-a")?.opens).toBe(3);
    expect(s.byPublication.find((p) => p.publicationId === "pdf-b")?.opens).toBe(2);
    expect(s.byPublication.reduce((x, p) => x + p.opens, 0)).toBe(s.counted);
  });

  it("does not merge two visitor IDs that share an IP or location", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => click({ visitor_id: "v1", metadata: { action: "open_pdf", ip: "1.1.1.1" } })),
      ...Array.from({ length: 5 }, () => click({ visitor_id: "v2", session_id: "s2", metadata: { action: "open_pdf", ip: "1.1.1.1" } })),
    ];
    const s = summarizePdfAccess(rows, kept("s1", "s2"));
    expect(s.counted).toBe(10);
    expect(s.visitors).toBe(2);
  });

  it("applies the human filter before the cap and drops unidentified visitors from headline", () => {
    const rows = [
      ...Array.from({ length: 4 }, () => click({ session_id: "bot" })),
      ...Array.from({ length: 5 }, () => click()),
      click({ visitor_id: null }),
    ];
    const s = summarizePdfAccess(rows, kept("s1"));
    expect(s.counted).toBe(5);
    expect(s.overCap).toBe(0);
    expect(s.excludedNonHuman).toBe(4);
    expect(s.excludedNoVisitorId).toBe(1);
    expect(s.rawActions).toBe(10);
  });

  it("applies the cap independently to each period window", () => {
    const rows = Array.from({ length: 7 }, (_, i) => click({ occurred_at: i < 3 ? at(i) : at(100 + i) }));
    const inWindow = (s: string, e: string) => rows.filter((r) => r.occurred_at >= s && r.occurred_at < e);
    const prior = summarizePdfAccess(inWindow(at(0), at(50)), kept("s1"));
    const current = summarizePdfAccess(inWindow(at(50), at(200)), kept("s1"));
    expect(prior.counted).toBe(3);
    expect(current.counted).toBe(4);
  });

  it("keeps missing publication ids out of rankings but in the total", () => {
    const s = summarizePdfAccess([click({ publication_id: null }), click()], kept("s1"));
    expect(s.counted).toBe(2);
    expect(s.countedMissingPublicationId).toBe(1);
    expect(s.uniquePublications).toBe(1);
  });

  it("computes PDF-open rate from sessions", () => {
    expect(pdfOpenRate(2, 8)).toBe(0.25);
    expect(pdfOpenRate(0, 0)).toBe(0);
  });
});
