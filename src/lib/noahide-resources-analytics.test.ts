import { describe, expect, it } from "vitest";
import { matchDestination, summarizeNoahideResources, type NoahideEventRow } from "./noahide-resources-analytics";
import { summarizeCanonical } from "@/integrations/supabase/admin-analytics-canonical";

const ASK = { target_host: "asknoah.org", target_path: "/7-commandments" };
const CHABAD = { target_host: "www.chabad.org", target_path: "/library/article_cdo/aid/5559665/jewish/The-Seven-Laws-of-Noah.htm" };
let n = 0;
const ev = (o: Partial<NoahideEventRow>): NoahideEventRow => ({
  event_id: `e${++n}`,
  event_name: "page_view",
  occurred_at: `2026-10-12T14:00:${String(n % 60).padStart(2, "0")}Z`,
  visitor_id: "v1",
  session_id: "s1",
  path: "/noahide-resources",
  device_type: "mobile",
  source_group: "Direct",
  metadata: null,
  ...o,
});
const human = (sid: string, vid = "v1") => ev({ session_id: sid, visitor_id: vid, event_name: "human_signal" });

describe("noahide resources analytics", () => {
  it("matches destinations strictly", () => {
    expect(matchDestination("www.asknoah.org", "/7-commandments/")).toBe("ask_noah");
    expect(matchDestination("evilasknoah.org", "/7-commandments")).toBeNull();
    expect(matchDestination("asknoah.org", "/7-commandments-x")).toBeNull();
    expect(matchDestination("chabad.org", "/library")).toBeNull();
  });

  it("handles zero visits", () => {
    const r = summarizeNoahideResources([ev({ path: "/" })]);
    expect(r.headline.sessions).toBe(0);
    expect(r.headline.clickThroughRate).toBeNull();
  });

  it("attributes only page events in mixed sessions and counts two clicks in one session once", () => {
    const r = summarizeNoahideResources([
      ev({ path: "/" }),
      ev({ path: "/", event_name: "outbound_click", metadata: ASK }),
      ev({}),
      human("s1"),
      ev({ event_name: "outbound_click", metadata: ASK }),
      ev({ event_name: "outbound_click", metadata: CHABAD }),
      ev({ event_name: "outbound_click", metadata: { target_host: "example.com", target_path: "/7-commandments" } }),
    ]);
    expect(r.headline.sessions).toBe(1);
    expect(r.headline.anyClickSessions).toBe(1);
    expect(r.headline.clickThroughRate).toBe(100);
    expect(r.destinations[0].qualifiedClicks).toBe(1);
    expect(r.destinations[1].clickedSessions).toBe(1);
    expect(r.diagnostics.rejectedOutboundClicks).toBe(1);
  });

  it("uses clicked sessions / page sessions for the rate and dedupes event IDs", () => {
    const click = ev({ session_id: "a", visitor_id: "va", event_name: "outbound_click", metadata: ASK });
    const r = summarizeNoahideResources([
      ev({ session_id: "a", visitor_id: "va" }), human("a", "va"), click, { ...click }, ev({ session_id: "a", visitor_id: "va", event_name: "outbound_click", metadata: ASK }),
      ev({ session_id: "b", visitor_id: "vb" }), human("b", "vb"),
    ]);
    expect(r.destinations[0].rawClicks).toBe(2);
    expect(r.destinations[0].repeatClicks).toBe(1);
    expect(r.headline.clickThroughRate).toBe(50);
  });

  it("excludes click-only sessions, bots and internal sessions from headlines", () => {
    const bot = Array.from({ length: 12 }, () => ev({ session_id: "bot", visitor_id: "vb", device_type: "desktop", event_name: "heartbeat", metadata: { active_seconds: 1 } }));
    const r = summarizeNoahideResources([
      ev({ session_id: "c", event_name: "outbound_click", metadata: ASK }),
      ev({ session_id: "bot", visitor_id: "vb", device_type: "desktop" }), ...bot,
      ev({ session_id: "int", visitor_id: "vi", is_internal: true }), human("int", "vi"),
    ]);
    expect(r.headline.sessions).toBe(0);
    expect(r.diagnostics.clickOnlySessionsWithoutPageView).toBe(1);
    expect(r.diagnostics.byConfidence.suspected_automation).toBe(1);
    expect(r.diagnostics.byConfidence.internal_test).toBe(1);
    expect(r.destinations[0].rawClicks).toBe(1);
  });

  it("caps heartbeat seconds, dedupes scroll milestones, and flags returning visitors", () => {
    const r = summarizeNoahideResources([
      ev({ visitor_id: "old" }), human("s1", "old"),
      ev({ visitor_id: "old", event_name: "heartbeat", metadata: { active_seconds: 99999 } }),
      ev({ visitor_id: "old", event_name: "heartbeat", metadata: { active_seconds: "bad" } }),
      ev({ visitor_id: "old", event_name: "scroll_depth", metadata: { percent: 50 } }),
      ev({ visitor_id: "old", event_name: "scroll_depth", metadata: { percent: 50 } }),
      ev({ visitor_id: "old", event_name: "scroll_depth", metadata: { percent: 33 } }),
    ], new Set(["old"]));
    expect(r.headline.activeSecondsTotal).toBe(300);
    expect(r.scrollReached.map((s) => s.sessions)).toEqual([1, 1, 0, 0]);
    expect(r.headline.returningVisitors).toBe(1);
    expect(r.journeys).toHaveLength(1);
  });

  it("tracks footer clicks independently from the Noahide page views and PDF use", () => {
    const click = ev({ event_name: "noahide_footer_click", path: "/", metadata: { placement: "site_footer", target_path: "/noahide-resources" } });
    const rows = [click, { ...click }, ev({ path: "/" }), human("s1"), ev({})];
    const result = summarizeNoahideResources(rows);
    expect(result.footer.rawClicks).toBe(1);
    expect(result.footer.clicks).toBe(1);
    expect(result.footer.sessions).toBe(1);
    expect(result.footer.visitors).toBe(1);
    expect(result.footer.sources).toEqual([{ label: "/", sessions: 1 }]);
    expect(result.headline.pageviews).toBe(1);
    expect(result.journeys[0].footerClicks).toBe(1);
    const canonical = summarizeCanonical(rows as never);
    expect(canonical.downloadActions).toBe(0);
    expect(canonical.openPdfClicks).toBe(0);
  });

  it("filters internal footer clicks from qualified counts", () => {
    const result = summarizeNoahideResources([
      ev({ session_id: "internal", visitor_id: "i", is_internal: true, event_name: "noahide_footer_click", path: "/", metadata: { placement: "site_footer", target_path: "/noahide-resources" } }),
      ev({ session_id: "external", visitor_id: "e", event_name: "noahide_footer_click", path: "/about", metadata: { placement: "site_footer", target_path: "/noahide-resources" } }),
    ]);
    expect(result.footer.rawClicks).toBe(2);
    expect(result.footer.clicks).toBe(1);
    expect(result.headline.sessions).toBe(0);
  });

  it("does not change PDF counters", () => {
    const rows = [ev({ session_id: "p", visitor_id: "vp" }), human("p", "vp"), ev({ session_id: "p", visitor_id: "vp", event_name: "outbound_click", metadata: ASK })];
    const s = summarizeCanonical(rows as never);
    expect(s.openPdfClicks).toBe(0);
    expect(s.downloadActions).toBe(0);
  });
});
