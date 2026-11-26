import { describe, expect, it } from "vitest";
import { buildDownloadServedRow } from "./download-served";
import { readCorrelation } from "./pdf-route-diagnostics.server";
import { pdfAccessActions } from "./pdf-access";

const ID = "16c4aa36-b60c-4801-9edb-49eece0cfcb0";
const ACTION = "3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const req = (cookieVid: string | null, a = ACTION) =>
  new Request(`https://t.test/view/${ID}/download?a=${a}&s=session-abc123&v=visitor-abc123`, {
    headers: cookieVid ? { cookie: `tftt_vid=${cookieVid}` } : {},
  });

describe("download_served correlation and catalogue identity", () => {
  it("accepts correlation only with a UUID action and the matching tftt_vid cookie", () => {
    expect(readCorrelation(req("visitor-abc123"))).toEqual({ action: ACTION, sid: "session-abc123", vid: "visitor-abc123" });
    expect(readCorrelation(req("someone-else"))).toBeNull();
    expect(readCorrelation(req(null))).toBeNull();
    expect(readCorrelation(req("visitor-abc123", "not-a-uuid"))).toBeNull();
  });

  it("takes parsha and year from the validated catalogue row and keys the row by action", () => {
    const row = buildDownloadServedRow({ action: ACTION, sid: "s1abcd", vid: "v1abcd" }, ID,
      { title: "Against All Odds", parsha_key: "Vayishlach", jewish_year: 5787 }, "f.pdf", { country: "US" }, new Date("2026-11-26T00:00:00Z"));
    expect(row["event_id"]).toBe(`served-${ACTION}`);
    expect(row["parsha"]).toBe("Vayishlach");
    expect(row["jewish_year"]).toBe(5787);
    expect(row["metadata"]).toEqual({ action_id: ACTION, filename: "f.pdf" });
    expect(row["country"]).toBe("US");
  });

  it("a download action and its served redirect sharing an action_id count once", () => {
    const base = { visitor_id: "v", session_id: "s", publication_id: ID };
    const actions = pdfAccessActions([
      { ...base, event_name: "download", event_id: "e1", occurred_at: "2026-11-26T00:00:00Z", metadata: { action: "download", action_id: ACTION } },
      { ...base, event_name: "download_served", event_id: `served-${ACTION}`, occurred_at: "2026-11-26T00:00:01Z", metadata: { action_id: ACTION } },
    ]);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe("download");
  });
});
