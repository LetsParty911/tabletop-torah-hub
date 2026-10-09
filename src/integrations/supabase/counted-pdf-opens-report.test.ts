import { describe, expect, it } from "vitest";
import { buildAnalyticsReport, summarizeCanonical, type EventRow } from "./admin-analytics-canonical";
import { buildObservations } from "@/lib/admin-reports";

let n = 0;
const ev = (o: Partial<EventRow> = {}): EventRow => ({
  event_name: "publication_click",
  event_id: `e-${++n}`,
  occurred_at: `2026-10-08T18:${String(n % 60).padStart(2, "0")}:00Z`,
  visitor_id: "v1",
  session_id: "s1",
  is_new_visitor: true,
  path: "/",
  publication_id: `pdf-${n}`,
  publication_title: `PDF ${n}`,
  device_type: "mobile",
  source_group: "WhatsApp",
  metadata: { action: "open_pdf" },
  ...o,
});
const win = { start: "2026-10-08T00:00:00Z", end: "2026-10-09T00:00:00Z" };

describe("Counted PDF opens wired into canonical reports", () => {
  it("caps one visitor at five across sessions; extra clicks stay in raw/over-cap audit", () => {
    n = 0;
    const rows = [
      ...[0, 1, 2, 3].map(() => ev({ session_id: "s1" })),
      ...[0, 1, 2].map(() => ev({ session_id: "s2" })),
    ];
    const r = buildAnalyticsReport(rows, new Set(), win);
    expect(r.metrics.countedPdfOpens).toBe(5);
    expect(r.metrics.pdfAccessRaw).toBe(7);
    expect(r.metrics.pdfAccessOverCap).toBe(2);
    expect(r.metrics.pdfAccessVisitorsOverCap).toBe(1);
    expect(r.metrics.openPdfClicks).toBe(7); // raw human click panel unchanged
    expect(r.details.countedPdfOpens).toHaveLength(5);
    // Overview, trend, funnel and journeys all agree with the headline.
    expect(r.overview.headline.countedPdfOpens).toBe(5);
    expect(r.overview.trend.reduce((a, t) => a + t.pdfOpens, 0)).toBe(5);
    expect(r.overview.journeys.reduce((a, j) => a + j.pdfOpens, 0)).toBe(5);
    expect(r.overview.funnels[0]!.stages.at(-1)!.label).toBe("Counted PDF open");
    expect(r.pdfAccess.byPublication.reduce((a, p) => a + p.opens, 0)).toBe(5);
    expect(r.pdfAccess.bySource).toEqual([{ label: "WhatsApp", opens: 5 }]);
  });

  it("counts different visitors independently and keeps since-last in sync", () => {
    n = 0;
    const rows = [ev({ visitor_id: "a", session_id: "sa" }), ev({ visitor_id: "b", session_id: "sb" })];
    expect(buildAnalyticsReport(rows, new Set(), win).metrics.countedPdfOpens).toBe(2);
    const since = summarizeCanonical(rows);
    expect(since.countedPdfOpens).toBe(2);
    expect(since.countedPdfOpenVisitors).toBe(2);
    expect(since.pdfOpenRate).toBe(1);
  });

  it("never counts automatic previews; pairs download + served once; dedups retries", () => {
    n = 0;
    const dl = ev({ event_name: "download", metadata: { action_id: "a1" }, publication_id: "p" });
    const rows = [
      ev({ event_name: "pdf_open", metadata: null, publication_id: "p" }),
      dl,
      { ...dl }, // transport retry, same event_id
      ev({ event_name: "download_served", metadata: { action_id: "a1" }, publication_id: "p" }),
    ];
    const r = buildAnalyticsReport(rows, new Set(), win);
    expect(r.metrics.countedPdfOpens).toBe(1);
    expect(r.pdfAccess.automaticPreviews).toBe(1);
    expect(r.metrics.downloads).toBe(1); // historical audit retained
  });

  it("excludes internal sessions before the cap", () => {
    n = 0;
    const rows = [ev(), ev({ session_id: "int", visitor_id: "iv", is_internal: true })];
    const r = buildAnalyticsReport(rows, new Set(), win);
    expect(r.metrics.countedPdfOpens).toBe(1);
    expect(r.metrics.pdfAccessExcludedNonHuman).toBe(1);
  });

  it("selected-period comparison uses counted opens, and observations cite them", () => {
    n = 0;
    const cur = buildAnalyticsReport([ev(), ev()], new Set(), win);
    const prev = buildAnalyticsReport([ev()], new Set(), win);
    expect(cur.metrics.countedPdfOpens - prev.metrics.countedPdfOpens).toBe(1);
    const notes = buildObservations({
      people: 1, usedTorah: 1, pdfOpens: 0, countedPdfOpens: cur.metrics.countedPdfOpens, signups: 0, returningReaders: 0,
      topPublication: null, topSourcePdfOpens: cur.pdfAccess.bySource[0]!, searchesWithoutContent: 0, searchesTotal: 0, suspectedSessions: 0,
    });
    expect(notes[0]).toBe("WhatsApp produced 2 of 2 counted PDF opens.");
  });
});
