import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearHolidayGateCacheForTests,
  buildAssurUrl,
  buildClosureResponse,
  classifyClosure,
  getVisitorClosure,
  localDateParts,
  parseAssurStatus,
  parseVisitorLocation,
} from "./shabbos-gate.server";

const nj = {
  latitude: 40.86, longitude: -74.12, tzid: "America/New_York",
  city: "Passaic", region: "New Jersey", country: "US",
};
const ipwho = {
  success: true, latitude: nj.latitude, longitude: nj.longitude,
  city: nj.city, region: nj.region, country_code: nj.country,
  timezone: { id: nj.tzid },
};
const request = new Request("https://torahforthetable.com/archive", {
  headers: { "cf-connecting-ip": "8.8.8.8", "cf-ipcountry": "US", accept: "text/html", "user-agent": "Mozilla/5.0" },
});
const json = (x: unknown) => new Response(JSON.stringify(x), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => __clearHolidayGateCacheForTests());

describe("visitor-local Shabbos and Yom Tov", () => {
  it("rejects partial geolocation and timezone payloads", () => {
    expect(parseVisitorLocation(ipwho)).toEqual(nj);
    expect(parseVisitorLocation({ ...ipwho, city: null })).toBeNull();
    expect(parseVisitorLocation({ ...ipwho, country_code: "US", region: null })).toBeNull();
    expect(parseVisitorLocation({ ...ipwho, timezone: { id: "Mars/Base" } })).toBeNull();
    expect(parseVisitorLocation({ ...ipwho, latitude: 200 })).toBeNull();
  });

  it("pins calendar lookup to approximate coordinates and an explicit instant", () => {
    const url = new URL(buildAssurUrl(nj, new Date("2026-10-23T23:30:00Z")));
    expect(url.searchParams.get("im")).toBe("1");
    expect(url.searchParams.get("tzid")).toBe("America/New_York");
    expect(url.searchParams.get("latitude")).toBe("40.86");
    expect(url.searchParams.get("dt")).toBe("2026-10-23T23:30:00.000Z");
    expect(parseAssurStatus({ status: { isAssurBemlacha: true } })).toBe(true);
    expect(parseAssurStatus({ status: { isAssurBemlacha: false } })).toBe(false);
    expect(parseAssurStatus({ status: {} })).toBeNull();
  });

  it("uses the geographic local date rather than the server timezone", () => {
    expect(localDateParts(new Date("2026-10-24T02:00:00Z"), "America/New_York"))
      .toEqual({ weekday: "Friday", date: "2026-10-23" });
  });

  it("opens on ordinary weekdays and closes when the calendar says prohibited", async () => {
    const times = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://ipwho.is/")) return json(ipwho);
      if (url.includes("im=1")) return json({ status: { isAssurBemlacha: true } });
      return json({ times: { sunset: "2026-10-23T18:00:00-04:00", tzeit85deg: "2026-10-23T19:00:00-04:00" } });
    }) as unknown as typeof fetch;
    expect(await getVisitorClosure(request, new Date("2026-10-23T23:30:00Z"), times)).toBe("shabbos");
  });

  it("returns no closure if either provider fails", async () => {
    const fetcher = vi.fn(async () => new Response("Unavailable", { status: 503 })) as unknown as typeof fetch;
    expect(await getVisitorClosure(request, new Date("2026-10-23T23:30:00Z"), fetcher)).toBeNull();
  });

  it("does not guess Saturday night is Motzei Shabbos if calendar says Yom Tov", async () => {
    const now = new Date("2026-10-25T00:30:00Z");
    const fetcher = vi.fn(async () => json({
      times: { sunset: "2026-10-24T18:00:00-04:00", tzeit85deg: "2026-10-24T19:00:00-04:00" },
    })) as unknown as typeof fetch;
    expect(await classifyClosure(nj, now, fetcher)).toBe("yom-tov");
  });

  it("serves an uncached, temporarily unavailable page, without misleading maintenance wording", async () => {
    const response = buildClosureResponse("shabbos");
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-TFTT-Gate")).toBe("shabbos-yom-tov");
    const html = await response.text();
    expect(html).toContain("Closed for Shabbos");
    expect(html).toContain("Motzei Shabbos");
    expect(html).not.toContain("Closed for Maintenance");
    expect(await buildClosureResponse("yom-tov", "HEAD").text()).toBe("");
  });
});
