import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { engagedAlertsFor, ENGAGED_ALERT_EVENTS, qualifiesForEngagedAlert, type AlertSessionRow } from "./visitor-alert-classifier";
import { ENGAGED_ALERT_EVENTS as FN_EVENTS, handleAlert, type SessionLoader } from "../../docs/visitor-alert-fix/visitor-alert/core";
import { createSessionLoader } from "../../docs/visitor-alert-fix/visitor-alert/session-loader";

const H = (h: Record<string, string> = {}) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });
const ENV = { webhookSecret: "test-secret", pushoverToken: "mock-token", pushoverUser: "mock-user" };
const AUTH = { "x-webhook-secret": "test-secret" };
const payload = (record: Record<string, unknown>, table = "engaged_visitor_alert_queue") => ({ type: "INSERT", table, record });
const row = (name: string, extra: Partial<AlertSessionRow> = {}): AlertSessionRow => ({
  event_id: "click-1", event_name: name, session_id: "a", visitor_id: "v", occurred_at: "2026-10-09T18:00:00Z", ...extra,
});
const click = row("publication_click", { metadata: { action: "open_pdf" } });
const rec = { session_id: "a", trigger_event_id: "click-1", trigger_event_name: "publication_click", trigger_metadata: { action: "open_pdf" }, publication_title: "Toras Avigdor", is_new_visitor: true, city: "Lakewood" };
const loader: SessionLoader = async () => [row("page_view"), click];
const mockFetch = () => vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
const passive = ["session_start", "page_view", "publication_impression", "heartbeat", "scroll_depth", "human_signal", "recommendation_view", "download_served", "pdf_open", "outbound_click", "search"];

describe("engaged alert classifier", () => {
  it("SQL and function allowlists exactly match, excluding automatic PDF previews", () => {
    expect([...FN_EVENTS]).toEqual([...ENGAGED_ALERT_EVENTS]);
    const sql = readFileSync("docs/visitor-alert-fix/migration.sql", "utf8");
    const list = sql.match(/new.event_name not in \(([\s\S]*?)\)/)![1];
    expect([...list.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([...ENGAGED_ALERT_EVENTS]);
    expect(sql).toContain("new.metadata->>'action'");
    expect(sql).toContain("<> 'open_pdf'");
  });

  it("passive events never qualify even with human-looking session evidence", () => {
    for (const event of passive) expect(qualifiesForEngagedAlert(row(event), [click])).toBe(false);
    expect(qualifiesForEngagedAlert(row("publication_click"), [click])).toBe(false);
    expect(qualifiesForEngagedAlert(click)).toBe(false);
    expect(qualifiesForEngagedAlert(click, [click])).toBe(true);
  });

  it("passive browsing remains silent even when the shared classifier would retain the session", () => {
    const rows = [row("page_view"), row("page_view", { occurred_at: "2026-10-09T18:01:00Z" }), row("page_view", { occurred_at: "2026-10-09T18:02:00Z" }), row("pdf_open"), row("human_signal")];
    const original = structuredClone(rows);
    expect(engagedAlertsFor(rows)).toEqual([]);
    expect(rows).toEqual(original);
  });

  it("one alert per session, retaining raw events", () => {
    const rows = [click, row("pdf_open"), row("download"), row("search"), row("filter_change", { session_id: "b" })];
    const original = structuredClone(rows);
    expect(engagedAlertsFor(rows).map((r) => r.session_id)).toEqual(["a", "b"]);
    expect(rows).toEqual(original);
  });

  it("excludes session-wide internal/Lovable provenance even if the click has no marker", () => {
    for (const extra of [{ is_internal: true }, { referrer_host: "id-preview--x.lovable.app" }, { referrer_host: "preview.lovableproject.com" }, { utm_source: "lovable" }, { user_agent: "LovableApp/1" }]) {
      expect(qualifiesForEngagedAlert(click, [row("page_view", extra), click])).toBe(false);
    }
    expect(qualifiesForEngagedAlert(click, [row("page_view", { referrer_host: "notlovable.app.example.com" }), click])).toBe(true);
    expect(qualifiesForEngagedAlert({ ...click, session_id: null }, [click])).toBe(false);
  });

  it("owner-identified passive test sessions produce zero alerts", () => {
    expect(engagedAlertsFor([row("page_view", { session_id: "e4a16974-f7e5-4122-9597-71899973a4bd" }), row("pdf_open", { session_id: "58d7755d-9546-43e6-b036-fffb834eb371" })])).toEqual([]);
  });
});

describe("staged notification core (mock network only)", () => {
  it("rejects missing config, authentication, wrong table and internal records before any read or push", async () => {
    const f = mockFetch();
    const load = vi.fn(loader);
    expect((await handleAlert(H(AUTH), payload(rec), { ...ENV, webhookSecret: undefined }, f, load)).code).toBe("not_configured");
    expect((await handleAlert(H(), payload(rec), ENV, f, load)).code).toBe("unauthorized");
    expect((await handleAlert(H(AUTH), null, ENV, f, load)).code).toBe("bad_payload");
    expect((await handleAlert(H(AUTH), payload(rec, "visitor_alert_queue"), ENV, f, load)).code).toBe("wrong_table");
    expect((await handleAlert(H(AUTH), payload({ ...rec, is_internal: true }), ENV, f, load)).code).toBe("internal");
    expect(load).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("automatic previews and untagged navigation never read or send", async () => {
    const f = mockFetch();
    const load = vi.fn(loader);
    for (const event of passive) expect((await handleAlert(H(AUTH), payload({ ...rec, trigger_event_name: event }), ENV, f, load)).code).toBe("not_engaged");
    expect((await handleAlert(H(AUTH), payload({ ...rec, trigger_metadata: null }), ENV, f, load)).code).toBe("not_engaged");
    expect(load).not.toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it("fails closed on missing, failed, foreign, internal, or unmatched canonical evidence", async () => {
    const f = mockFetch();
    for (const load of [undefined, async () => null, async () => [], async () => [row("pdf_open")], async () => [{ ...click, session_id: "other" }], async () => [click, row("page_view", { is_internal: true })], async () => [click, row("page_view", { utm_source: "lovable" })], async () => { throw new Error("lookup failed"); }]) {
      expect((await handleAlert(H(AUTH), payload(rec), ENV, f, load)).code).toBe("unverified");
    }
    expect((await handleAlert(H(AUTH), payload({ ...rec, trigger_event_id: null }), ENV, f, loader)).code).toBe("unverified");
    expect(f).not.toHaveBeenCalled();
  });

  it("all dry-run controls classify evidence and produce a precise message without sending", async () => {
    const f = mockFetch();
    for (const result of [
      await handleAlert(H(AUTH), payload(rec), { ...ENV, dryRun: true }, f, loader),
      await handleAlert(H({ ...AUTH, "x-dry-run": "1" }), payload(rec), ENV, f, loader),
      await handleAlert(H(AUTH), payload({ ...rec, dry_run: true }), ENV, f, loader),
    ]) {
      expect(result.code).toBe("dry_run");
      expect(result.message).toMatch(/^Visitor engaged: clicked Open PDF/);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("sends eligible messages only to injected mock fetch and handles failures", async () => {
    const f = mockFetch();
    expect((await handleAlert(H(AUTH), payload(rec), ENV, f, loader)).code).toBe("sent");
    expect(f).toHaveBeenCalledTimes(1);
    const failed = vi.fn(async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect((await handleAlert(H(AUTH), payload(rec), ENV, failed, loader)).code).toBe("push_failed");
    const thrown = vi.fn(async () => { throw new Error("mock failure"); }) as unknown as typeof fetch;
    expect((await handleAlert(H(AUTH), payload(rec), ENV, thrown, loader)).code).toBe("push_failed");
  });
});

describe("canonical session loader", () => {
  it("reads canonical rows using encoded session filters without writing events", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([click]))) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    expect(await createSessionLoader("https://example.invalid", "mock-key", f)("a")).toEqual([click]);
    const url = f.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/rest/v1/analytics_events");
    expect(url.searchParams.get("session_id")).toBe("eq.a");
    expect(f.mock.calls[0][1].method).toBeUndefined();
  });
  it("fails closed on configuration, malformed rows, foreign sessions, HTTP failure and oversized sessions", async () => {
    const f = mockFetch();
    expect(await createSessionLoader(undefined, undefined, f)("a")).toBeNull();
    expect(f).not.toHaveBeenCalled();
    for (const response of [new Response("[]", { status: 500 }), new Response("{}"), new Response(JSON.stringify([{ ...click, session_id: "other" }]))]) {
      const read = vi.fn(async () => response) as unknown as typeof fetch;
      expect(await createSessionLoader("https://example.invalid", "mock-key", read)("a")).toBeNull();
    }
    const read = vi.fn(async () => new Response(JSON.stringify(Array(1000).fill(click)))) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    expect(await createSessionLoader("https://example.invalid", "mock-key", read)("a")).toBeNull();
    expect(read).toHaveBeenCalledTimes(10);
  });
  it("paginates without accepting a truncated first page", async () => {
    let count = 0;
    const read = vi.fn(async () => new Response(JSON.stringify(count++ === 0 ? Array(1000).fill(row("page_view")) : [click]))) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    const result = await createSessionLoader("https://example.invalid", "mock-key", read)("a");
    expect(result).toHaveLength(1001);
    expect((read.mock.calls[1][0] as URL).searchParams.get("offset")).toBe("1000");
  });
});

describe("staged artifacts", () => {
  it("preserves analytics and has no geographic eligibility rules", () => {
    const sql = readFileSync("docs/visitor-alert-fix/migration.sql", "utf8");
    expect(sql).not.toMatch(/(?:delete from|update|truncate)\s+(?:public\.)?analytics_events/i);
    const guard = sql.slice(sql.indexOf("if new.session_id"), sql.indexOf("then"));
    expect(guard).not.toMatch(/city|region|country|asn|ip_address|network/i);
    expect(sql).toContain("on conflict (session_id) do nothing");
    const src = readFileSync("docs/visitor-alert-fix/visitor-alert/index.ts", "utf8");
    expect(src).toContain('"PUSHOVER_APP_TOKEN"');
    expect(src).toContain('"PUSHOVER_USER_KEY"');
    expect(src).toContain("createSessionLoader");
  });
});
