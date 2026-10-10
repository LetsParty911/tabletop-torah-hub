import { describe, expect, it, vi } from "vitest";
import { buildMaintenanceVisit, trackMaintenanceVisit, type TrackDeps } from "./maintenance-traffic.server";
import { formatNy, nyMidnightUtc, summarizeMaintenanceVisits, type MaintenanceVisitRow } from "./maintenance-traffic";

process.env["SUPABASE_SERVICE_ROLE_KEY"] = "test-only-key";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36";
const IP = "203.0.113.7"; // documentation range

function req(path: string, headers: Record<string, string> = {}, method = "GET") {
  return new Request(`https://torahforthetable.com${path}`, {
    method,
    headers: {
      "user-agent": CHROME, "accept-language": "en-US", accept: "text/html",
      "sec-fetch-mode": "navigate", "sec-fetch-dest": "document",
      "cf-connecting-ip": IP, "cf-ipcountry": "US", ...headers,
    },
  });
}
const html = () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
function deps(on = true, internal = false): TrackDeps & { insert: ReturnType<typeof vi.fn> } {
  return { maintenanceEnabled: async () => on, isInternal: async () => internal, insert: vi.fn(async () => {}), now: new Date("2026-10-11T03:00:00Z") };
}

describe("maintenance traffic tracking", () => {
  it("counts a public navigation once when maintenance is ON", async () => {
    const d = deps();
    expect(await trackMaintenanceVisit(req("/archive?utm_source=x&email=a@b.c", { referer: "https://www.google.com/search?q=t" }), html(), d)).toBe(true);
    expect(d.insert).toHaveBeenCalledTimes(1);
    const row = d.insert.mock.calls[0]![0];
    expect(row.path).toBe("/archive");
    expect(row.referrer_domain).toBe("google.com");
    expect(row.classification).toBe("likely_human");
    expect(row.city).toBeNull();
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(IP);
    expect(serialized).not.toContain("Chrome");
    expect(serialized).not.toContain("utm_source");
    expect(serialized).not.toContain("@");
  });

  it("does nothing when maintenance is OFF or the device is internal", async () => {
    for (const d of [deps(false), deps(true, true)]) {
      expect(await trackMaintenanceVisit(req("/"), html(), d)).toBe(false);
      expect(d.insert).not.toHaveBeenCalled();
    }
  });

  it("excludes admin, api, assets, PDF, static, redirects, server fns, prefetch, preview hosts and non-HTML", async () => {
    const d = deps();
    const cases: [Request, Response][] = [
      [req("/admin"), html()], [req("/admin-analytics"), html()], [req("/api/events"), html()],
      [req("/assets/a.js"), html()], [req("/favicon.ico"), html()], [req("/robots.txt"), html()],
      [req("/view/abc/pdf"), html()], [req("/r"), html()], [req("/_serverFn/x"), html()],
      [req("/", { "sec-purpose": "prefetch" }), html()], [req("/", { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" }), html()],
      [req("/", {}, "HEAD"), html()], [req("/", { referer: "https://lovable.dev/projects/x" }), html()],
      [new Request("https://id-preview--abc.lovable.app/", { headers: { accept: "text/html" } }), html()],
      [req("/"), new Response(null, { status: 302 })], [req("/"), new Response("{}", { headers: { "content-type": "application/json" } })],
    ];
    for (const [r, res] of cases) expect(await trackMaintenanceVisit(r, res, d)).toBe(false);
    expect(d.insert).not.toHaveBeenCalled();
  });

  it("classifies bots as automation and header-poor clients as unknown", async () => {
    const bot = await buildMaintenanceVisit(req("/", { "user-agent": "Googlebot/2.1" }), html(), deps());
    expect(bot?.classification).toBe("automation");
    const bare = new Request("https://torahforthetable.com/", { headers: { "user-agent": CHROME } });
    expect((await buildMaintenanceVisit(bare, html(), deps()))?.classification).toBe("unknown");
  });

  it("uses a hashed first-party cookie key when present, else a daily hash", async () => {
    const a = await buildMaintenanceVisit(req("/", { cookie: "tftt_vid=abcdef123456" }), html(), deps());
    expect(a?.visitor_key_source).toBe("first_party_cookie");
    expect(a?.visitor_key).not.toContain("abcdef123456");
    const b = await buildMaintenanceVisit(req("/"), html(), deps());
    expect(b?.visitor_key_source).toBe("daily_network_hash");
    expect(b?.visitor_key).toMatch(/^[0-9a-f]{24}$/);
  });

  it("fails open when the insert throws", async () => {
    const d = deps();
    d.insert.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await trackMaintenanceVisit(req("/"), html(), d)).toBe(false);
    spy.mockRestore();
  });
});

describe("maintenance traffic report", () => {
  const row = (o: Partial<MaintenanceVisitRow>): MaintenanceVisitRow => ({
    created_at: "2026-10-11T00:30:00Z", path: "/", country: "US", region: null, city: null,
    device: "mobile", referrer_domain: null, classification: "likely_human", visitor_key: "k1", ...o,
  });
  it("separates categories, estimates uniques and never guesses a city", () => {
    const s = summarizeMaintenanceVisits([
      row({}), row({ visitor_key: "k1" }), row({ visitor_key: "k2", classification: "automation" }),
      row({ visitor_key: null, classification: "unknown", country: null }), row({ city: "Lakewood", region: "NJ", visitor_key: "k3" }),
    ]);
    expect(s).toMatchObject({ totalRequests: 5, estimatedUniqueVisitors: 3, likelyHuman: 3, likelyHumanEstimatedUnique: 2, automation: 1, unknown: 1 });
    expect(s.cities.map((c) => c.label)).toEqual(expect.arrayContaining(["US (city unknown)", "Location unknown", "Lakewood, NJ, US"]));
    expect(s.byDay).toEqual([{ label: "2026-10-10", count: 5 }]); // 00:30 UTC = Oct 10 evening ET
  });
  it("converts New York midnight with DST awareness", () => {
    expect(nyMidnightUtc("2026-10-10").toISOString()).toBe("2026-10-10T04:00:00.000Z");
    expect(nyMidnightUtc("2026-12-01").toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(formatNy("2026-12-01T05:00:00Z")).toContain("EST");
    expect(formatNy("2026-10-10T04:00:00Z")).toContain("EDT");
  });
});
