import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SETTINGS, DELIBERATE_EVENTS, MAX_ATTEMPTS, MemoryOutbox, campaignChannel, campaignKey,
  dispatchBatch, engagedEligible, engagedKey, gate, maskEmail, normalizeSettings, subscriberKey, subscriberMessage,
  type Settings,
} from "./notifications/core";
import { MEANINGFUL_INTENT } from "./human-sessions";
import { R_REDIRECT_TARGET } from "./r-redirect";
import { S_REDIRECT_TARGET } from "./s-redirect";

const live: Settings = { ...DEFAULT_SETTINGS, enabled: true, dryRun: false, categories: { ...DEFAULT_SETTINGS.categories, engaged_reader: true, campaign_engaged: true, new_subscriber: true } };
const T0 = Date.parse("2026-10-13T18:00:00Z");

describe("defaults are conservative", () => {
  it("master off, dry run on, every category off", () => {
    const s = normalizeSettings(undefined);
    expect(s.enabled).toBe(false);
    expect(s.dryRun).toBe(true);
    expect(Object.values(s.categories).every((v) => v === false)).toBe(true);
    expect(gate(s, "new_subscriber", new Date(T0))).toBe("skip");
  });
  it("enabled category with master off is dry run, never send", () => {
    const s = { ...DEFAULT_SETTINGS, categories: { ...DEFAULT_SETTINGS.categories, new_subscriber: true } };
    expect(gate(s, "new_subscriber", new Date(T0))).toBe("dry_run");
  });
  it("quiet hours hold; quiet mode skips engaged", () => {
    expect(gate({ ...live, quietStart: 13, quietEnd: 15 }, "engaged_reader", new Date(T0))).toBe("hold"); // 14:00 ET
    expect(gate({ ...live, mode: "quiet" }, "engaged_reader", new Date(T0))).toBe("skip");
  });
});

describe("duplicate signup", () => {
  it("same subscriber key enqueues once", () => {
    const o = new MemoryOutbox();
    const m = subscriberMessage("rachel@example.com", "home");
    expect(o.enqueue(subscriberKey("h1"), "new_subscriber", m.title, m.message, T0)).toBe(true);
    expect(o.enqueue(subscriberKey("h1"), "new_subscriber", m.title, m.message, T0)).toBe(false);
    expect(o.rows.size).toBe(1);
  });
  it("push text masks the email", () => {
    expect(maskEmail("rachel@example.com")).toBe("r***@example.com");
    expect(subscriberMessage("rachel@example.com", null).message).not.toContain("rachel@");
  });
  it("server hook only fires for new, non-existing subscriptions", () => {
    const src = readFileSync("src/integrations/supabase/api.functions.ts", "utf8");
    expect(src).toContain("if (!sender.alreadySubscribed && !existing)");
  });
});

describe("campaign channels", () => {
  const q = (u: string) => Object.fromEntries(new URL(u).searchParams);
  it("/s is Shul Poster and /r is OurKehilla, never conflated", () => {
    expect(campaignChannel(q(S_REDIRECT_TARGET))).toBe("shul_poster");
    expect(campaignChannel(q(R_REDIRECT_TARGET))).toBe("ourkehilla");
    expect(campaignChannel({ utm_source: "whatsapp", utm_medium: "social" })).toBeNull();
  });
  it("rapid reloads of the same campaign session enqueue once", () => {
    const o = new MemoryOutbox();
    for (let i = 0; i < 5; i++) o.enqueue(campaignKey("shul_poster", "sess-1"), "campaign_engaged", "t", "m", T0 + i);
    expect(o.rows.size).toBe(1);
  });
});

describe("engaged eligibility", () => {
  const row = { session_id: "s1", trigger_event_name: "publication_click", trigger_action: "open_pdf" };
  it("passive pdf_open, heartbeat, page_view never qualify", () => {
    for (const ev of ["pdf_open", "heartbeat", "page_view", "human_signal", "download_served", "scroll_depth"])
      expect(engagedEligible({ ...row, trigger_event_name: ev }, "likely_human").ok).toBe(false);
  });
  it("excludes internal and suspected automation; allows uncertain deliberate action", () => {
    expect(engagedEligible({ ...row, is_internal: true }, "likely_human").ok).toBe(false);
    expect(engagedEligible(row, "suspected_automation").ok).toBe(false);
    expect(engagedEligible(row, "internal_test").ok).toBe(false);
    expect(engagedEligible(row, "uncertain").ok).toBe(true);
  });
  it("one engaged alert per session", () => {
    const o = new MemoryOutbox();
    o.enqueue(engagedKey("s1"), "engaged_reader", "t", "m", T0);
    o.enqueue(engagedKey("s1"), "engaged_reader", "t", "m", T0 + 1000);
    expect(o.rows.size).toBe(1);
  });
  it("deliberate list matches the dashboard MEANINGFUL_INTENT", () => {
    expect([...DELIBERATE_EVENTS].sort()).toEqual([...MEANINGFUL_INTENT].sort());
  });
});

describe("delivery, failure, retry, concurrency", () => {
  it("provider failure is retried with backoff and then succeeds once", async () => {
    const o = new MemoryOutbox();
    o.enqueue("k", "new_subscriber", "t", "m", T0);
    let now = T0; let calls = 0;
    const send = async () => (++calls === 1 ? { ok: false, error: "http_500" } : { ok: true, error: null });
    await dispatchBatch(o, live, send, () => now);
    expect([...o.rows.values()][0]!.status).toBe("failed");
    await dispatchBatch(o, live, send, () => now); // not yet due
    expect(calls).toBe(1);
    now += 61_000;
    await dispatchBatch(o, live, send, () => now);
    expect([...o.rows.values()][0]!.status).toBe("sent");
    await dispatchBatch(o, live, send, () => (now += 10 ** 7));
    expect(calls).toBe(2); // sent is never resent
  });
  it("gives up after MAX_ATTEMPTS and manual retry re-queues", async () => {
    const o = new MemoryOutbox();
    o.enqueue("k", "new_subscriber", "t", "m", T0);
    let now = T0;
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) { await dispatchBatch(o, live, async () => ({ ok: false, error: "x" }), () => now); now += 4 * 3600_000; }
    const r = [...o.rows.values()][0]!;
    expect(r.status).toBe("dead");
    expect(r.attempts).toBe(MAX_ATTEMPTS);
    expect(o.retryFailed(now)).toBe(1);
  });
  it("concurrent dispatchers never claim the same row", async () => {
    const o = new MemoryOutbox();
    for (let i = 0; i < 30; i++) o.enqueue("k" + i, "new_subscriber", "t", "m", T0);
    const sent: string[] = [];
    const send = async (_t: string, m: string) => { sent.push(m); await Promise.resolve(); return { ok: true, error: null }; };
    const store = { claim: async (n: number, t: number) => o.claim(n, t), finish: (id: string, s: never, t: number) => o.finish(id, s, t) };
    await Promise.all([1, 2, 3, 4].map(() => dispatchBatch(store, live, send, () => T0, 10)));
    expect(sent.length).toBe(30);
    expect([...o.rows.values()].every((r) => r.status === "sent" && r.attempts === 1)).toBe(true);
  });
  it("a crashed dispatcher's lease expires and the row is reclaimed once", () => {
    const o = new MemoryOutbox();
    o.enqueue("k", "new_subscriber", "t", "m", T0);
    expect(o.claim(5, T0).length).toBe(1);          // worker crashes, never finishes
    expect(o.claim(5, T0 + 1000).length).toBe(0);   // lease still held
    expect(o.claim(5, T0 + 3 * 60_000).length).toBe(1);
  });
  it("dry run and disabled categories never call the provider", async () => {
    const o = new MemoryOutbox();
    o.enqueue("a", "new_subscriber", "t", "m", T0);
    o.enqueue("b", "pdf_milestone", "t", "m", T0);
    let calls = 0;
    await dispatchBatch(o, { ...live, dryRun: true }, async () => { calls++; return { ok: true, error: null }; }, () => T0);
    expect(calls).toBe(0);
    expect([...o.rows.values()].map((r) => r.status).sort()).toEqual(["dry_run", "skipped"]);
  });
});

describe("zero VPN behavior changes", () => {
  it("the notification code never touches VPN tables, VPN sender or block logic", () => {
    for (const f of ["src/lib/notifications/core.ts", "src/lib/notifications/dispatch.server.ts", "src/lib/notifications.functions.ts", "docs/notifications/migration-notifications.sql"]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/from\(["']vpn_|import .*vpn-(block|notify)/);
    }
    const sql = readFileSync("docs/notifications/migration-notifications.sql", "utf8");
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?trigger/i);
    expect(sql).not.toMatch(/alter table public\.(vpn_|analytics_events|visitor_alert_queue|engaged_visitor_alert_queue)/i);
  });
});
