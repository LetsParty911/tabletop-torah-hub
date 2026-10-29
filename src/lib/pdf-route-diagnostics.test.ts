import { describe, expect, it, vi } from "vitest";
import {
  readCorrelation,
  recordPdfRouteOutcome,
  runInBackground,
  writePdfOutcome,
  type PdfOutcomeDeps,
} from "./pdf-route-diagnostics.server";

const PUB = "11111111-2222-3333-4444-555555555555";
const ACTION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const VID = "f0e1d2c3-b4a5-4678-9abc-def012345678";
const SID = "sess-1234567890";
const CHROME = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/128 Safari/537.36";

function req(q: Record<string, string>, cookie: string | null = `tftt_vid=${encodeURIComponent(VID)}`, ua = CHROME) {
  const u = new URL(`https://torahforthetable.com/view/${PUB}/pdf`);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const headers: Record<string, string> = { "user-agent": ua };
  if (cookie) headers.cookie = cookie;
  return new Request(u, { headers });
}
const good = () => req({ a: ACTION, s: SID, v: VID });
function deps(over: Partial<PdfOutcomeDeps> = {}) {
  const write = vi.fn(async () => {});
  return { write, d: { isAutomated: () => false, isInternal: async () => false, now: () => new Date("2026-10-14T23:00:00Z"), write, ...over } as PdfOutcomeDeps };
}

describe("readCorrelation", () => {
  it("accepts matching cookie + ids", () => expect(readCorrelation(good())).toEqual({ action: ACTION, sid: SID, vid: VID }));
  it("rejects missing params", () => expect(readCorrelation(req({ a: ACTION, s: SID }))).toBeNull());
  it("rejects missing cookie", () => expect(readCorrelation(req({ a: ACTION, s: SID, v: VID }, null))).toBeNull());
  it("rejects forged visitor (cookie mismatch)", () =>
    expect(readCorrelation(req({ a: ACTION, s: SID, v: "f0e1d2c3-0000-4678-9abc-def012345678" }))).toBeNull());
  it("rejects non-UUID action", () => expect(readCorrelation(req({ a: "not-a-uuid-at-all", s: SID, v: VID }))).toBeNull());
  it("rejects unsafe session chars", () => expect(readCorrelation(req({ a: ACTION, s: "bad<script>", v: VID }))).toBeNull());
  it("survives malformed cookie encoding", () => expect(readCorrelation(req({ a: ACTION, s: SID, v: VID }, "tftt_vid=%E0%A4%A"))).toBeNull());
});

describe("writePdfOutcome", () => {
  it("happy path writes truthful redirect_issued row keyed by action_id, no IP/UA", async () => {
    const { write, d } = deps();
    expect(await writePdfOutcome(good(), PUB, 302, d)).toBe(true);
    const row = write.mock.calls[0][0];
    expect(row).toMatchObject({
      event_id: `pdf-outcome-${ACTION}`, event_name: "pdf_route_result", visitor_id: VID, session_id: SID,
      publication_id: PUB, path: `/view/${PUB}/pdf`, is_internal: false,
      metadata: { action_id: ACTION, http_status: 302, outcome: "redirect_issued" },
    });
    expect(JSON.stringify(row)).not.toMatch(/Chrome|203\.0|ip/i);
  });
  it("404/500 recorded as route_failed", async () => {
    const { write, d } = deps();
    await writePdfOutcome(good(), PUB, 404, d);
    await writePdfOutcome(good(), PUB, 500, d);
    expect(write.mock.calls.map((c) => c[0].metadata.outcome)).toEqual(["route_failed", "route_failed"]);
  });
  it("forged identifiers never write", async () => {
    const { write, d } = deps();
    expect(await writePdfOutcome(req({ a: ACTION, s: SID, v: VID }, "tftt_vid=someone-else-123"), PUB, 302, d)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
  it("bots never write", async () => {
    const { write, d } = deps({ isAutomated: () => true });
    expect(await writePdfOutcome(good(), PUB, 302, d)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
  it("marked internal browsers never write PDF route analytics", async () => {
    const { write, d } = deps({ isInternal: async () => true });
    expect(await writePdfOutcome(req({ a: ACTION, s: SID, v: VID, internal: "0" }), PUB, 302, d)).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
  it("failed write is swallowed", async () => {
    const { d } = deps({ write: async () => { throw new Error("db down"); } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(writePdfOutcome(good(), PUB, 302, d)).resolves.toBe(false);
  });
});

describe("runtime scheduling", () => {
  it("uses Worker waitUntil when available and does not wait", async () => {
    const wu = vi.fn();
    const never = new Promise(() => {});
    expect(await runInBackground(never, wu, 5000)).toBe("scheduled");
    expect(wu).toHaveBeenCalledOnce();
  });
  it("without waitUntil, waits at most the bound", async () => {
    const t = Date.now();
    expect(await runInBackground(new Promise(() => {}), null, 50)).toBe("bounded");
    expect(Date.now() - t).toBeLessThan(500);
  });
  it("throwing waitUntil falls back to bounded wait", async () => {
    expect(await runInBackground(Promise.resolve(), () => { throw new Error("x"); }, 50)).toBe("bounded");
  });
  it("recordPdfRouteOutcome completes the write via waitUntil", async () => {
    const { write, d } = deps();
    const pending: Promise<unknown>[] = [];
    await recordPdfRouteOutcome(good(), PUB, 302, d, (p) => pending.push(p));
    await Promise.all(pending);
    expect(write).toHaveBeenCalledOnce();
  });
  it("recordPdfRouteOutcome never throws when the write rejects", async () => {
    const { d } = deps({ write: async () => { throw new Error("db down"); } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordPdfRouteOutcome(good(), PUB, 302, d, null)).resolves.toBeUndefined();
  });
  it("skips work entirely without valid correlation", async () => {
    const { write, d } = deps();
    const wu = vi.fn();
    await recordPdfRouteOutcome(req({}), PUB, 302, d, wu);
    expect(wu).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
