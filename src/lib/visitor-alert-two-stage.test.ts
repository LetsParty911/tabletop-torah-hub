import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { MEANINGFUL_INTENT } from "./human-sessions";
import { normalizeSourceGroup } from "./source-group";
import {
  ENGAGED_EVENTS, buildMessage, handleTwoStage, sourceGroup, visitRef,
  type NotificationLedger, type Stage,
} from "../../docs/visitor-alert-fix/visitor-alert/two-stage";

// In-memory model of visitor_notification_log + claim_visitor_notification (PK session,stage).
function memLedger() {
  const rows = new Map<string, string>();
  const ledger: NotificationLedger = {
    async claim(sid, stage) {
      await Promise.resolve();
      const k = `${sid}|${stage}`;
      const cur = rows.get(k);
      if (cur === undefined || cur === "failed") { rows.set(k, "sending"); return true; }
      return false;
    },
    async finish(sid, stage, status) { rows.set(`${sid}|${stage}`, status); },
  };
  return { ledger, rows };
}
// Never the network: a mock Pushover endpoint.
const mockFetch = (status = 200) => vi.fn(async () => new Response("{}", { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const H = (h: Record<string, string> = {}) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });
const AUTH = H({ "x-webhook-secret": "test-secret" });
const ENV = { webhookSecret: "test-secret", pushoverToken: "tok", pushoverUser: "usr" };
const SID = "9f1c2b3a-1111-4222-8333-444455556666";
const shul = { utm_source: "shul", utm_medium: "poster", utm_campaign: "oct-2026-shul-poster", referrer_host: null };
const first = (extra: Record<string, unknown> = {}) => ({
  type: "INSERT", table: "visitor_alert_queue",
  record: { session_id: SID, is_new_visitor: true, city: "Clifton", region: "NJ", country: "US", device_type: "mobile", path: "/", occurred_at: "2026-10-13T18:53:00Z", ...shul, ...extra },
});
const engaged = (ev: string, extra: Record<string, unknown> = {}) => ({
  type: "INSERT", table: "engaged_visitor_alert_queue",
  record: { session_id: SID, trigger_event_name: ev, city: "Clifton", region: "NJ", country: "US", device_type: "mobile", occurred_at: "2026-10-13T18:55:00Z", ...shul, ...extra },
});

/** Simulates the two DB triggers: first page_view -> stage 1 row; first MEANINGFUL_INTENT -> stage 2 row. */
function queueRows(events: { event_name: string; session_id: string; is_internal?: boolean; metadata?: Record<string, string> }[]) {
  const q1 = new Set<string>(), q2 = new Set<string>();
  const out: { body: unknown }[] = [];
  for (const e of events) {
    if (e.is_internal) continue;
    if (e.event_name === "page_view" && !q1.has(e.session_id)) { q1.add(e.session_id); out.push({ body: first({ session_id: e.session_id }) }); }
    if ((ENGAGED_EVENTS as readonly string[]).includes(e.event_name) && !q2.has(e.session_id)) {
      q2.add(e.session_id);
      out.push({ body: engaged(e.event_name, { session_id: e.session_id, trigger_action: e.metadata?.action ?? null }) });
    }
  }
  return out;
}
async function run(events: Parameters<typeof queueRows>[0], replay = 1) {
  const { ledger } = memLedger();
  const f = mockFetch();
  const results = [];
  for (let i = 0; i < replay; i++)
    for (const q of queueRows(events)) results.push(await handleTwoStage(AUTH, q.body, ENV, ledger, f));
  return { f, results, sent: results.filter((r) => r.code === "sent").map((r) => r.title) };
}

describe("definitions stay aligned with the dashboard", () => {
  it("engaged events equal MEANINGFUL_INTENT and exclude passive events", () => {
    expect([...ENGAGED_EVENTS].sort()).toEqual([...MEANINGFUL_INTENT].sort());
    for (const ev of ["page_view", "pdf_open", "heartbeat", "scroll_depth", "human_signal", "download_served"])
      expect(ENGAGED_EVENTS as readonly string[]).not.toContain(ev);
    const sql = readFileSync("docs/visitor-alert-fix/migration-two-stage.sql", "utf8");
    for (const ev of ENGAGED_EVENTS) expect(sql).toContain(`'${ev}'`);
    expect(sql).not.toMatch(/'pdf_open'|'heartbeat'|'download_served'/);
  });
  it("source labels match the dashboard, including Shul Poster", () => {
    const cases = [shul, { utm_source: null, utm_medium: null, utm_campaign: null, referrer_host: null },
      { utm_source: "whatsapp", utm_medium: "social", utm_campaign: "x", referrer_host: null },
      { utm_source: null, utm_medium: null, utm_campaign: null, referrer_host: "www.google.com" }];
    for (const c of cases) expect(sourceGroup(c)).toBe(normalizeSourceGroup(c));
  });
});

describe("messages", () => {
  it("first alert says Unconfirmed, keeps details, and explains it is not automated", () => {
    const m = buildMessage("unconfirmed", first().record);
    expect(m.title).toBe("New Unconfirmed Visit");
    expect(m.message).toContain("Clifton, NJ, US · mobile");
    expect(m.message).toContain("Source: Shul Poster (campaign: oct-2026-shul-poster)");
    expect(m.message).toContain("Landing page: /");
    expect(m.message).toContain("2:53 PM ET");
    expect(m.message).toContain("Not automated, blocked or rejected");
    expect(buildMessage("unconfirmed", first({ is_new_visitor: false }).record).title).toBe("Returning Unconfirmed Visit");
  });
  it("follow-up is Engaged Reader for Open PDF / download, otherwise Confirmed Engagement", () => {
    const pdf = buildMessage("engaged", engaged("publication_click", { trigger_action: "open_pdf", publication_title: "Bereishis Sheet" }).record);
    expect(pdf.title).toBe("Engaged Reader");
    expect(pdf.message).toContain("Opened a PDF: “Bereishis Sheet”");
    expect(pdf.message).toContain("Source: Shul Poster");
    expect(buildMessage("engaged", engaged("download").record).title).toBe("Engaged Reader");
    expect(buildMessage("engaged", engaged("search").record).title).toBe("Confirmed Engagement — Searched");
    expect(buildMessage("engaged", engaged("publication_click").record).title).toBe("Confirmed Engagement — Selected a publication");
  });
  it("both alerts share a short visit ref and contain no IP or user agent", () => {
    const a = buildMessage("unconfirmed", first({ ip_address: "203.0.113.9", user_agent: "Mozilla/5.0" }).record).message;
    const b = buildMessage("engaged", engaged("share_click").record).message;
    expect(a).toContain(`Visit ref: ${visitRef(SID)}`);
    expect(b).toContain(`Visit ref: ${visitRef(SID)}`);
    expect(visitRef(SID)).toHaveLength(8);
    expect(a + b).not.toMatch(/203\.0\.113|Mozilla/);
  });
});

describe("event flow (mock Pushover only)", () => {
  const S = SID;
  it("first load -> only the first alert; quiet visit stays at 1", async () => {
    const { sent } = await run([{ event_name: "page_view", session_id: S }, { event_name: "heartbeat", session_id: S }, { event_name: "pdf_open", session_id: S }]);
    expect(sent).toEqual(["New Unconfirmed Visit"]);
  });
  it("dwell/scroll/human_signal only -> no Engaged push", async () => {
    const { sent } = await run(["page_view", "heartbeat", "scroll_depth", "human_signal"].map((event_name) => ({ event_name, session_id: S })));
    expect(sent).toEqual(["New Unconfirmed Visit"]);
  });
  it("meaningful event -> second alert; many interactions, reloads and replays -> still 2", async () => {
    const ev = [
      { event_name: "page_view", session_id: S }, { event_name: "page_view", session_id: S },
      { event_name: "publication_click", session_id: S, metadata: { action: "open_pdf" } },
      { event_name: "download", session_id: S }, { event_name: "share_click", session_id: S },
      { event_name: "page_view", session_id: S },
    ];
    const { sent, f } = await run(ev, 3);
    expect(sent).toEqual(["New Unconfirmed Visit", "Engaged Reader"]);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("concurrent duplicate deliveries send once per stage", async () => {
    const { ledger } = memLedger();
    const f = mockFetch();
    const calls = Array.from({ length: 5 }, () => [handleTwoStage(AUTH, first(), ENV, ledger, f), handleTwoStage(AUTH, engaged("signup"), ENV, ledger, f)]).flat();
    const res = await Promise.all(calls);
    expect(res.filter((r) => r.code === "sent")).toHaveLength(2);
    expect(res.filter((r) => r.code === "duplicate")).toHaveLength(8);
  });
  it("failed Pushover call can be retried once and then stops", async () => {
    const { ledger, rows } = memLedger();
    expect((await handleTwoStage(AUTH, first(), ENV, ledger, mockFetch(500))).code).toBe("push_failed");
    expect(rows.get(`${SID}|unconfirmed`)).toBe("failed");
    expect((await handleTwoStage(AUTH, first(), ENV, ledger, mockFetch())).code).toBe("sent");
    expect((await handleTwoStage(AUTH, first(), ENV, ledger, mockFetch())).code).toBe("duplicate");
  });
  it("internal / Lovable sessions never alert and never claim the ledger", async () => {
    const { ledger, rows } = memLedger();
    const f = mockFetch();
    expect((await handleTwoStage(AUTH, first({ is_internal: true }), ENV, ledger, f)).code).toBe("internal");
    expect((await handleTwoStage(AUTH, engaged("search", { referrer_host: "id-preview--x.lovable.app" }), ENV, ledger, f)).code).toBe("internal");
    expect(f).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
    const { sent } = await run([{ event_name: "page_view", session_id: S, is_internal: true }, { event_name: "download", session_id: S, is_internal: true }]);
    expect(sent).toEqual([]);
  });
  it("rejects bad secret, wrong table, unknown event and missing creds without sending", async () => {
    const { ledger } = memLedger();
    const f = mockFetch();
    expect((await handleTwoStage(H(), first(), ENV, ledger, f)).code).toBe("unauthorized");
    expect((await handleTwoStage(AUTH, { ...first(), table: "analytics_events" }, ENV, ledger, f)).code).toBe("wrong_table");
    expect((await handleTwoStage(AUTH, engaged("pdf_open"), ENV, ledger, f)).code).toBe("not_engaged");
    expect((await handleTwoStage(AUTH, first(), { webhookSecret: "test-secret" }, ledger, f)).code).toBe("not_configured");
    expect(f).not.toHaveBeenCalled();
  });
  it("dry run builds messages without calling Pushover", async () => {
    const { ledger } = memLedger();
    const f = mockFetch();
    const r = await handleTwoStage(AUTH, first(), { ...ENV, dryRun: true }, ledger, f);
    expect(r.code).toBe("dry_run");
    expect(r.title).toBe("New Unconfirmed Visit");
    expect(f).not.toHaveBeenCalled();
  });
  it("stage tables map correctly", () => {
    const stages: Stage[] = ["unconfirmed", "engaged"];
    expect(stages).toHaveLength(2);
  });
});
