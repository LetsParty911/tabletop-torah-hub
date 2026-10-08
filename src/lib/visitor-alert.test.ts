import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ENGAGED_ALERT_EVENTS, engagedAlertsFor, qualifiesForEngagedAlert, type AlertEventRow } from "./visitor-alert-classifier";
import { ENGAGED_ALERT_EVENTS as FN_EVENTS, handleAlert } from "../../docs/visitor-alert-fix/visitor-alert/core";

const H = (h: Record<string, string> = {}) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });
const ENV = { webhookSecret: "s3cret", pushoverToken: "t", pushoverUser: "u" };
const AUTH = { "x-webhook-secret": "s3cret" };
const payload = (rec: Record<string, unknown>, table = "engaged_visitor_alert_queue") => ({ type: "INSERT", table, record: rec });
const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("engaged alert classifier", () => {
  it("allowlists stay in sync across classifier, function and SQL", () => {
    expect([...FN_EVENTS]).toEqual([...ENGAGED_ALERT_EVENTS]);
    const sql = readFileSync("docs/visitor-alert-fix/migration.sql", "utf8");
    for (const e of ENGAGED_ALERT_EVENTS) expect(sql).toContain(`'${e}'`);
    for (const e of ["page_view", "session_start", "heartbeat", "human_signal", "publication_impression", "scroll_depth"])
      expect(sql).not.toContain(`'${e}'`);
  });

  it("passive events never qualify", () => {
    for (const e of ["session_start", "page_view", "publication_impression", "heartbeat", "scroll_depth", "human_signal", "recommendation_view", "download_served"])
      expect(qualifiesForEngagedAlert({ event_name: e, session_id: "x" })).toBe(false);
  });

  it("owner-identified Boydton and Des Moines sessions produce zero alerts", () => {
    const boydton: AlertEventRow[] = [
      { event_name: "session_start", session_id: "e4a16974-f7e5-4122-9597-71899973a4bd" },
      { event_name: "page_view", session_id: "e4a16974-f7e5-4122-9597-71899973a4bd" },
      ...Array.from({ length: 13 }, () => ({ event_name: "heartbeat", session_id: "e4a16974-f7e5-4122-9597-71899973a4bd" })),
    ];
    const desMoines: AlertEventRow[] = [{ event_name: "page_view", session_id: "58d7755d-9546-43e6-b036-fffb834eb371" }];
    expect(engagedAlertsFor([...boydton, ...desMoines])).toHaveLength(0);
  });

  it("one alert per session despite multiple/concurrent actions", () => {
    const rows = ["publication_click", "pdf_open", "download", "search"].map((e) => ({ event_name: e, session_id: "a" }));
    const out = engagedAlertsFor([...rows, { event_name: "filter_change", session_id: "b" }]);
    expect(out.map((r) => r.session_id)).toEqual(["a", "b"]);
    expect(out[0].event_name).toBe("publication_click");
  });

  it("excludes internal and Lovable provenance, not location", () => {
    expect(qualifiesForEngagedAlert({ event_name: "search", session_id: "a", is_internal: true })).toBe(false);
    expect(qualifiesForEngagedAlert({ event_name: "search", session_id: "a", referrer_host: "id-preview--x.lovable.app" })).toBe(false);
    expect(qualifiesForEngagedAlert({ event_name: "search", session_id: "a", utm_source: "lovable" })).toBe(false);
    expect(qualifiesForEngagedAlert({ event_name: "search", session_id: "a", referrer_host: "notlovable.app.example.com" })).toBe(true);
    expect(qualifiesForEngagedAlert({ event_name: "search", session_id: null })).toBe(false);
  });
});

describe("staged visitor-alert function core", () => {
  const rec = { session_id: "a", trigger_event_name: "publication_click", publication_title: "Toras Avigdor", is_new_visitor: true, city: "Lakewood" };

  it("rejects missing config, bad secret, bad payload, wrong table, unengaged, internal — no fetch", async () => {
    const f = okFetch();
    expect((await handleAlert(H(AUTH), payload(rec), { ...ENV, webhookSecret: undefined }, f)).code).toBe("not_configured");
    expect((await handleAlert(H({ "x-webhook-secret": "nope" }), payload(rec), ENV, f)).code).toBe("unauthorized");
    expect((await handleAlert(H(AUTH), null, ENV, f)).code).toBe("bad_payload");
    expect((await handleAlert(H(AUTH), payload({ session_id: "a", event_name: "page_view" }, "visitor_alert_queue"), ENV, f)).code).toBe("wrong_table");
    expect((await handleAlert(H(AUTH), payload({ session_id: "a", trigger_event_name: "page_view" }), ENV, f)).code).toBe("not_engaged");
    expect((await handleAlert(H(AUTH), payload({ ...rec, session_id: "" }), ENV, f)).code).toBe("not_engaged");
    expect((await handleAlert(H(AUTH), payload({ ...rec, is_internal: true }), ENV, f)).code).toBe("internal");
    expect(f).not.toHaveBeenCalled();
  });

  it("dry-run builds the message without sending", async () => {
    const f = okFetch();
    for (const r of [
      await handleAlert(H(AUTH), payload(rec), { ...ENV, dryRun: true }, f),
      await handleAlert(H({ ...AUTH, "x-dry-run": "1" }), payload(rec), ENV, f),
      await handleAlert(H(AUTH), payload({ ...rec, dry_run: true }), ENV, f),
    ]) {
      expect(r.code).toBe("dry_run");
      expect(r.message).toMatch(/^Visitor engaged: selected a publication/);
      expect(r.message).not.toMatch(/New visitor/);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("sends once with mock fetch and reports failures", async () => {
    const f = okFetch();
    expect((await handleAlert(H(AUTH), payload(rec), ENV, f)).code).toBe("sent");
    expect(f).toHaveBeenCalledTimes(1);
    const bad = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect((await handleAlert(H(AUTH), payload(rec), ENV, bad)).code).toBe("push_failed");
    const thrown = vi.fn(async () => { throw new Error("x"); }) as unknown as typeof fetch;
    expect((await handleAlert(H(AUTH), payload(rec), ENV, thrown)).code).toBe("push_failed");
    expect((await handleAlert(H(AUTH), payload(rec), { webhookSecret: "s3cret" }, f)).code).toBe("not_configured");
  });
});
